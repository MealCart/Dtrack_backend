// src/services/podService.js
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const axios = require('axios');

class PODService {
  static async generatePOD(jobData, photos = []) {
    try {
      console.log('📄 Generating POD PDF...');
      
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595.28, 841.89]);
      const { width, height } = page.getSize();

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      let y = height - 50;
      const margin = 50;
      const lineHeight = 22;

      // ===== HEADER =====
      page.drawText('PROOF OF DELIVERY (POD)', {
        x: margin,
        y: y,
        size: 22,
        font: fontBold,
        color: rgb(0.1, 0.2, 0.5),
      });
      y -= 15;

      page.drawLine({
        start: { x: margin, y: y },
        end: { x: width - margin, y: y },
        thickness: 2,
        color: rgb(0.1, 0.2, 0.5),
      });
      y -= 30;

      // ===== DO NUMBER & STATUS =====
      const doNumber = jobData.do_number || 'N/A';
      page.drawText(`D.O. Number: ${doNumber}`, {
        x: margin,
        y: y,
        size: 16,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      y -= lineHeight;

      const status = jobData.status || jobData.primary_job_status || 'COMPLETED';
      page.drawText(`Status: ${status.toUpperCase()}`, {
        x: margin,
        y: y,
        size: 14,
        font: fontBold,
        color: status === 'completed' || status === 'delivered' ? rgb(0, 0.6, 0) : rgb(0.8, 0.4, 0),
      });
      y -= lineHeight + 10;

      // ===== TWO COLUMN SECTION =====
      const col1X = margin;
      const col2X = width / 2 + 20;

      // === COLUMN 1: Customer Details ===
      page.drawText('CUSTOMER / RECIPIENT', {
        x: col1X,
        y: y,
        size: 12,
        font: fontBold,
        color: rgb(0.1, 0.2, 0.5),
      });
      y -= lineHeight + 5;

      const recipient = jobData.deliver_to_collect_from || jobData.deliver_to || jobData.recipient_name || 'N/A';
      page.drawText(recipient, {
        x: col1X,
        y: y,
        size: 14,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      y -= lineHeight;

      const address = jobData.address || jobData.delivery_address || '';
      if (address) {
        const addrLines = address.split(',').map(s => s.trim());
        for (const line of addrLines) {
          page.drawText(line, {
            x: col1X,
            y: y,
            size: 11,
            font: font,
            color: rgb(0.2, 0.2, 0.2),
          });
          y -= lineHeight - 5;
        }
      }

      if (jobData.postal_code) {
        page.drawText(`Postcode: ${jobData.postal_code}`, {
          x: col1X,
          y: y,
          size: 11,
          font: font,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= lineHeight;
      }

      if (jobData.phone || jobData.phone_number) {
        page.drawText(`Phone: ${jobData.phone || jobData.phone_number}`, {
          x: col1X,
          y: y,
          size: 11,
          font: font,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= lineHeight;
      }

      y -= 10;

      // === COLUMN 2: Job Details ===
      let col2Y = y + 35; // Reset Y for column 2

      page.drawText('JOB DETAILS', {
        x: col2X,
        y: col2Y,
        size: 12,
        font: fontBold,
        color: rgb(0.1, 0.2, 0.5),
      });
      col2Y -= lineHeight + 5;

      const fields = [
        { label: 'Group', value: jobData.group_name },
        { label: 'Run', value: jobData.run_number || jobData.run_no },
        { label: 'Scheduled', value: jobData.date || jobData.scheduled_date },
        { label: 'Time Slot', value: jobData.time_window },
        { label: 'POD Time', value: jobData.pod_time },
        { label: 'Driver', value: jobData.assign_to },
        { label: 'Boxes', value: jobData.number_of_shipping_labels || jobData.cartons || jobData.boxes },
      ];

      for (const field of fields) {
        if (field.value && field.value !== 'N/A' && field.value !== 'null' && field.value !== '') {
          page.drawText(`${field.label}:`, {
            x: col2X,
            y: col2Y,
            size: 10,
            font: fontBold,
            color: rgb(0.4, 0.4, 0.4),
          });
          page.drawText(String(field.value), {
            x: col2X + 60,
            y: col2Y,
            size: 10,
            font: font,
            color: rgb(0.1, 0.1, 0.1),
          });
          col2Y -= lineHeight - 2;
        }
      }

      // ===== INSTRUCTIONS =====
      const instructionsY = Math.min(y, col2Y) - 20;

      if (jobData.instructions) {
        page.drawText('INSTRUCTIONS', {
          x: margin,
          y: instructionsY,
          size: 12,
          font: fontBold,
          color: rgb(0.1, 0.2, 0.5),
        });
        
        let instrY = instructionsY - lineHeight - 5;
        const instrText = jobData.instructions;
        const words = instrText.split(' ');
        let line = '';
        const maxWidth = width - margin * 2 - 20;
        
        for (const word of words) {
          const testLine = line + word + ' ';
          const testWidth = testLine.length * 5; // Approximate width
          if (testWidth > maxWidth && line.length > 0) {
            page.drawText(line.trim(), {
              x: margin + 10,
              y: instrY,
              size: 10,
              font: font,
              color: rgb(0.2, 0.2, 0.2),
            });
            instrY -= lineHeight - 5;
            line = word + ' ';
          } else {
            line = testLine;
          }
        }
        if (line.trim()) {
          page.drawText(line.trim(), {
            x: margin + 10,
            y: instrY,
            size: 10,
            font: font,
            color: rgb(0.2, 0.2, 0.2),
          });
        }
      }

      // ===== PHOTOS SECTION =====
      const photoStartY = Math.min(instructionsY - (jobData.instructions ? 60 : 20), 350);
      
      if (photos && photos.length > 0) {
        const photoYPos = photoStartY - 20;
        page.drawText('POD PHOTOS', {
          x: margin,
          y: photoYPos,
          size: 12,
          font: fontBold,
          color: rgb(0.1, 0.2, 0.5),
        });

        let photoX = margin;
        let currentPhotoY = photoYPos - 20;
        const photoSize = 110;
        const gap = 10;
        let photoCount = 0;

        for (const photoUrl of photos) {
          if (photoCount >= 4) break;
          try {
            console.log(`📸 Embedding photo ${photoCount + 1}: ${photoUrl}`);
            
            const response = await axios.get(photoUrl, {
              responseType: 'arraybuffer',
              timeout: 10000,
              headers: {
                'User-Agent': 'Mozilla/5.0',
              },
            });

            let image;
            const contentType = response.headers['content-type'] || '';
            
            try {
              if (contentType.includes('png')) {
                image = await pdfDoc.embedPng(response.data);
              } else {
                image = await pdfDoc.embedJpg(response.data);
              }
            } catch (embedError) {
              console.error('Failed to embed image, trying as JPG:', embedError.message);
              try {
                image = await pdfDoc.embedJpg(response.data);
              } catch (e) {
                console.error('Failed to embed as JPG too:', e.message);
                continue;
              }
            }

            if (image) {
              const aspectRatio = image.width / image.height;
              let drawWidth = photoSize;
              let drawHeight = photoSize / aspectRatio;
              if (drawHeight > photoSize) {
                drawHeight = photoSize;
                drawWidth = photoSize * aspectRatio;
              }

              page.drawImage(image, {
                x: photoX,
                y: currentPhotoY - drawHeight,
                width: drawWidth,
                height: drawHeight,
              });

              photoX += drawWidth + gap;
              photoCount++;

              if (photoX + photoSize > width - margin) {
                photoX = margin;
                currentPhotoY -= photoSize + gap;
              }
            }
          } catch (error) {
            console.error(`Failed to embed photo ${photoCount + 1}:`, error.message);
          }
        }
      }

      // ===== FOOTER =====
      const footerY = 40;
      page.drawLine({
        start: { x: margin, y: footerY + 15 },
        end: { x: width - margin, y: footerY + 15 },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      });

      page.drawText(`Generated: ${new Date().toLocaleString()}`, {
        x: margin,
        y: footerY,
        size: 8,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });

      page.drawText(`D.O. #: ${doNumber}`, {
        x: width - margin - 120,
        y: footerY,
        size: 8,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });

      console.log('✅ PDF generated successfully');
      return pdfDoc;

    } catch (error) {
      console.error('❌ PDF generation error:', error);
      throw error;
    }
  }
}

module.exports = PODService;