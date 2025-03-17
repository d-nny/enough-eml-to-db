# Email Processor Worker for Cloudflare

This Cloudflare Worker processes emails stored in R2 and manages their metadata in D1 database.

## Setup Instructions

1. **Prerequisites**:
   - [Node.js](https://nodejs.org/) (v16 or later)
   - [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
   - A Cloudflare account with Workers, R2, and D1 enabled

2. **Configuration**:
   - Edit `wrangler.toml` to update your account ID
   - Create D1 database and update the database_id
   - Create R2 bucket and update the bucket name if needed
   - Configure the Queue

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Set up D1 Database**:
   ```bash
   wrangler d1 create email-database
   # Copy the database_id to your wrangler.toml
   wrangler d1 execute email-database --file=schema.sql
   ```

5. **Set up R2 Bucket**:
   ```bash
   wrangler r2 bucket create email-storage
   ```

6. **Set up Queue**:
   ```bash
   wrangler queues create email-processing-queue
   ```

7. **Development**:
   ```bash
   npm run dev
   ```

8. **Deployment**:
   ```bash
   npm run deploy
   ```

## Worker Functionality

This worker:
1. Listens for events from a queue
2. Processes email files from R2 storage
3. Extracts metadata and content
4. Stores data in D1 database
5. Manages email attachments

## Queue Message Format

### Regular Email Processing:
Send the R2 path of the email file as the message body:
```
emails/user@example.com/Inbox/123.eml
```

### Command Messages:
For special operations, use the format:
```
COMMAND:ACTION:param1=value1:param2=value2
```

Example commands:
- `COMMAND:RESYNC:prefix=emails/:limit=50` - Resynchronize emails from R2 to database

## File Structure

- `src/index.js` - Main worker code
- `wrangler.toml` - Cloudflare Worker configuration
- `schema.sql` - D1 database schema
- `package.json` - Node.js project configuration