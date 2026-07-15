import Database from 'better-sqlite3';

/**
 * SQLite-backed nonce tracking for bridge events.
 * Prevents double-processing of events and tracks relay status.
 */
export class NonceDB {
  private db: Database.Database;
  private stmts: {
    isProcessed: Database.Statement;
    insert: Database.Statement;
    updateStatus: Database.Statement;
    updateRelay: Database.Statement;
    getStatus: Database.Statement;
    getPending: Database.Statement;
  };

  constructor(dbPath: string = './relayer.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();

    // Prepare statements for performance
    this.stmts = {
      isProcessed: this.db.prepare(
        'SELECT 1 FROM processed_events WHERE source_chain_id = ? AND nonce = ? AND event_type = ?'
      ),
      insert: this.db.prepare(
        `INSERT OR IGNORE INTO processed_events (source_chain_id, nonce, event_type, tx_hash, status)
         VALUES (?, ?, ?, ?, ?)`
      ),
      updateStatus: this.db.prepare(
        `UPDATE processed_events SET status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE source_chain_id = ? AND nonce = ? AND event_type = ?`
      ),
      updateRelay: this.db.prepare(
        `UPDATE processed_events SET status = 'completed', relay_tx_hash = ?, updated_at = CURRENT_TIMESTAMP
         WHERE source_chain_id = ? AND nonce = ? AND event_type = ?`
      ),
      getStatus: this.db.prepare(
        'SELECT status FROM processed_events WHERE source_chain_id = ? AND nonce = ? AND event_type = ?'
      ),
      getPending: this.db.prepare(
        "SELECT * FROM processed_events WHERE status = 'pending' OR status = 'processing'"
      ),
    };
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processed_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_chain_id INTEGER NOT NULL,
        nonce INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        relay_tx_hash TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_chain_id, nonce, event_type)
      );
      CREATE TABLE IF NOT EXISTS block_cursors (
        chain_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        last_block INTEGER NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(chain_id, event_type)
      );
    `);
    // Retry support (added later — ALTER is a no-op if columns already exist)
    const cols = (this.db.pragma('table_info(processed_events)') as { name: string }[]).map((c) => c.name);
    if (!cols.includes('event_data')) this.db.exec('ALTER TABLE processed_events ADD COLUMN event_data TEXT');
    if (!cols.includes('attempts')) this.db.exec('ALTER TABLE processed_events ADD COLUMN attempts INTEGER DEFAULT 0');
    if (!cols.includes('next_retry_at')) this.db.exec('ALTER TABLE processed_events ADD COLUMN next_retry_at INTEGER');
  }

  isProcessed(sourceChainId: number, nonce: bigint, eventType: string): boolean {
    return !!this.stmts.isProcessed.get(sourceChainId, nonce.toString(), eventType);
  }

  markProcessing(sourceChainId: number, nonce: bigint, eventType: string, txHash: string): void {
    this.stmts.insert.run(sourceChainId, nonce.toString(), eventType, txHash, 'processing');
  }

  markCompleted(sourceChainId: number, nonce: bigint, eventType: string, relayTxHash: string): void {
    this.stmts.updateRelay.run(relayTxHash, sourceChainId, nonce.toString(), eventType);
  }

  markFailed(sourceChainId: number, nonce: bigint, eventType: string): void {
    this.stmts.updateStatus.run('failed', sourceChainId, nonce.toString(), eventType);
  }

  // Schedule a retry: keep the serialized event so the attempt survives restarts.
  markRetry(sourceChainId: number, nonce: bigint, eventType: string, eventData: string, attempts: number, delaySeconds: number): void {
    this.db.prepare(
      `UPDATE processed_events
       SET status = 'retry', event_data = ?, attempts = ?, next_retry_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE source_chain_id = ? AND nonce = ? AND event_type = ?`
    ).run(eventData, attempts, Math.floor(Date.now() / 1000) + delaySeconds, sourceChainId, nonce.toString(), eventType);
  }

  getDueRetries(eventType: string): { source_chain_id: number; nonce: string; event_data: string; attempts: number }[] {
    return this.db.prepare(
      `SELECT source_chain_id, nonce, event_data, attempts FROM processed_events
       WHERE status = 'retry' AND event_type = ? AND event_data IS NOT NULL AND next_retry_at <= ?`
    ).all(eventType, Math.floor(Date.now() / 1000)) as { source_chain_id: number; nonce: string; event_data: string; attempts: number }[];
  }

  getStatus(sourceChainId: number, nonce: bigint, eventType: string): string | null {
    const row = this.stmts.getStatus.get(sourceChainId, nonce.toString(), eventType) as { status: string } | undefined;
    return row?.status ?? null;
  }

  getLastBlock(chainId: number, eventType: string): bigint | null {
    const row = this.db.prepare(
      'SELECT last_block FROM block_cursors WHERE chain_id = ? AND event_type = ?'
    ).get(chainId, eventType) as { last_block: number } | undefined;
    return row ? BigInt(row.last_block) : null;
  }

  setLastBlock(chainId: number, eventType: string, blockNumber: bigint): void {
    this.db.prepare(
      `INSERT INTO block_cursors (chain_id, event_type, last_block)
       VALUES (?, ?, ?)
       ON CONFLICT(chain_id, event_type) DO UPDATE SET last_block = ?, updated_at = CURRENT_TIMESTAMP`
    ).run(chainId, eventType, blockNumber.toString(), blockNumber.toString());
  }

  close(): void {
    this.db.close();
  }
}
