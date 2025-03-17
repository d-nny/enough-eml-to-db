// Helper function to parse email content
async function parseEmailContent(emailContent) {
    try {
      const headers = {};
      let previewText = '';
      const attachments = [];
      
      // Extract headers
      const headerMatch = emailContent.match(/^([\s\S]*?)\r?\n\r?\n/);
      if (headerMatch) {
        const headerText = headerMatch[1];
        
        // Extract common headers
        headers.cc = extractHeader(headerText, 'CC');
        headers.bcc = extractHeader(headerText, 'BCC');
        headers.replyTo = extractHeader(headerText, 'Reply-To');
        
        // Add more header extractions as needed
      }
      
      // Extract a preview text (first ~100 chars of text)
      const bodyMatch = emailContent.match(/\r?\n\r?\n([\s\S]*)/);
      if (bodyMatch) {
        // Simple text extraction - remove HTML tags if present
        let textContent = bodyMatch[1].replace(/<[^>]*>/g, ' ');
        // Replace multiple spaces with single space
        textContent = textContent.replace(/\s+/g, ' ');
        // Get first ~100 chars for preview
        previewText = textContent.trim().substring(0, 100);
      }
      
      // Extract attachments
      const boundary = emailContent.match(/boundary="([^"]+)"/)?.[1];
      
      if (boundary) {
        const parts = emailContent.split(`--${boundary}`);
        
        for (const part of parts) {
          // Check if this part is an attachment
          const contentDisposition = part.match(/Content-Disposition: attachment;\s+filename="([^"]+)"/i);
          
          if (contentDisposition) {
            const filename = contentDisposition[1];
            const contentType = part.match(/Content-Type: ([^\r\n;]+)/i)?.[1] || 'application/octet-stream';
            
            // Find where the actual content starts (after the headers)
            const contentStart = part.indexOf('\r\n\r\n');
            if (contentStart > 0) {
              let content = part.substring(contentStart + 4);
              
              // Handle content transfer encoding
              const encoding = part.match(/Content-Transfer-Encoding: ([^\r\n]+)/i)?.[1]?.toLowerCase();
              
              // Convert content based on encoding
              if (encoding === 'base64') {
                // Remove linebreaks from base64 content
                content = content.replace(/[\r\n]/g, '');
                
                // Decode base64 to binary using Web APIs
                content = Uint8Array.from(atob(content), c => c.charCodeAt(0));
              } else {
                // For other encodings, convert to Uint8Array for consistent handling
                content = new TextEncoder().encode(content);
              }
              
              attachments.push({
                filename,
                contentType,
                content,
                size: content.length
              });
            }
          }
        }
      }
      
      return { headers, previewText, attachments };
    } catch (error) {
      console.error("Error parsing email content:", error);
      return { headers: {}, previewText: '', attachments: [] };
    }
  }
  
  // Helper function to extract a header value
  function extractHeader(headerText, headerName) {
    const regex = new RegExp(`^${headerName}:\\s*(.+?)$`, 'im');
    const match = headerText.match(regex);
    return match ? match[1].trim() : null;
  }
  
  // Main processing function for regular email messages
  async function processEmailMessage(emailPath, env, ctx) {
    console.log(`Processing email at path: ${emailPath}`);
    
    if (!emailPath || typeof emailPath !== 'string') {
      throw new Error(`Invalid emailPath: ${JSON.stringify(emailPath)}`);
    }
    
    // Fetch the email file from R2
    const emailObject = await env.EMAIL_BUCKET.get(emailPath);
    
    if (!emailObject) {
      throw new Error(`Email not found in R2: ${emailPath}`);
    }
    
    // Extract metadata from the R2 object
    const metadata = emailObject.customMetadata || {};
    
    console.log(`Fetched email metadata:`, {
      to: metadata.to,
      from: metadata.from,
      subject: metadata.subject,
      messageId: metadata.messageId,
      size: metadata.size
    });
    
    // Extract the folder from the path (assuming path format: emails/user@example.com/Inbox/123.eml)
    const pathParts = emailPath.split('/');
    let currentFolder = 'Inbox'; // Default
    
    if (pathParts.length >= 3) {
      currentFolder = pathParts[pathParts.length - 2]; // Get the folder name from path
    }
    
    // Parse the email content to extract CC and BCC info if available
    const emailContent = await emailObject.text();
    
    // Parse email contents for more header information and preview text
    const { headers, previewText, attachments } = await parseEmailContent(emailContent);
    
    // Prepare email record for database
    const emailRecord = {
      to_address: metadata.to,
      current_folder: currentFolder,
      recipients: metadata.to, // Primary recipient
      cc_recipients: headers.cc || null,
      bcc_recipients: headers.bcc || null,
      from_address: metadata.from,
      subject: metadata.subject || '',
      preview_text: previewText,
      size_bytes: metadata.size || emailObject.size,
      file_path: emailPath,
      has_attachment: attachments.length > 0 ? 1 : 0,
      date_received: metadata.receivedAt || new Date().toISOString(),
      message_id: metadata.messageId || ''
    };
    
    // Insert email into database
    const emailResult = await env.EMAIL_DB.prepare(`
      INSERT INTO emails (
        to_address, current_folder, recipients, cc_recipients, bcc_recipients,
        from_address, subject, preview_text, size_bytes, file_path,
        has_attachment, date_received, message_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).bind(
      emailRecord.to_address,
      emailRecord.current_folder,
      emailRecord.recipients,
      emailRecord.cc_recipients,
      emailRecord.bcc_recipients,
      emailRecord.from_address,
      emailRecord.subject,
      emailRecord.preview_text,
      emailRecord.size_bytes,
      emailRecord.file_path,
      emailRecord.has_attachment,
      emailRecord.date_received,
      emailRecord.message_id
    ).first();
    
    if (!emailResult || !emailResult.id) {
      throw new Error("Failed to insert email record");
    }
    
    const emailId = emailResult.id;
    console.log(`Email record inserted with ID: ${emailId}`);
    
    // Process attachments if any
    if (attachments.length > 0) {
      console.log(`Processing ${attachments.length} attachments`);
      
      for (const attachment of attachments) {
        // Create attachment path in R2
        const attachmentPath = `${emailPath.replace('.eml', '')}/attachments/${attachment.filename}`;
        
        // Store the attachment in R2
        await env.EMAIL_BUCKET.put(attachmentPath, attachment.content);
        
        // Store attachment in database
        await env.EMAIL_DB.prepare(`
          INSERT INTO attachments (
            email_id, filename, content_type, size_bytes, file_path
          ) VALUES (?, ?, ?, ?, ?)
        `).bind(
          emailId,
          attachment.filename,
          attachment.contentType,
          attachment.content.length,
          attachmentPath
        ).run();
        
        console.log(`Stored attachment: ${attachment.filename} (${attachment.content.length} bytes)`);
      }
    }
    
    return { 
      success: true, 
      emailId, 
      emailPath,
      attachmentCount: attachments.length
    };
  }
  
  export default {
    // Process a direct HTTP request to process an email
    async fetch(request, env, ctx) {
      try {
        const url = new URL(request.url);
        
        // Handle process endpoint
        if (url.pathname === '/process') {
          if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
          }
          
          // Extract email path from request body
          const { emailPath } = await request.json();
          
          if (!emailPath) {
            return new Response('Email path is required', { status: 400 });
          }
          
          // Process the email
          const result = await processEmailMessage(emailPath, env, ctx);
          
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Handle health check
        if (url.pathname === '/health') {
          return new Response('OK', { status: 200 });
        }
        
        // Default response for unknown routes
        return new Response('Not found', { status: 404 });
      } catch (error) {
        console.error(`Error handling request:`, error);
        return new Response(`Error: ${error.message}`, { status: 500 });
      }
    }
  };