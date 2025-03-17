-- Emails table
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_address TEXT NOT NULL,
  current_folder TEXT NOT NULL DEFAULT 'Inbox',
  recipients TEXT,
  cc_recipients TEXT,
  bcc_recipients TEXT,
  from_address TEXT NOT NULL,
  subject TEXT,
  preview_text TEXT,
  size_bytes INTEGER,
  file_path TEXT NOT NULL UNIQUE,
  has_attachment INTEGER DEFAULT 0,
  date_received TEXT NOT NULL,
  message_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on message_id for faster lookup
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(current_folder);
CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date_received);

-- Attachments table
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER,
  file_path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
);

-- Create index on email_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);