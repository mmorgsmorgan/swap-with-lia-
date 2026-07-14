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
