// src/services/labelService.js
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const { createCanvas } = require('canvas');
const JsBarcode = require('jsbarcode');
const path = require('path');
const fs = require('fs');

// Generate Barcode as PNG buffer
const generateBarcode = async (text) => {
  try {
    const canvas = createCanvas(300, 80);
    const ctx = canvas.getContext('2d');

    JsBarcode(canvas, text, {
      format: 'CODE128',
      width: 2,
      height: 65,
      displayValue: true,
      fontSize: 12,
      font: 'monospace',
      textAlign: 'center',
      textPosition: 'bottom',
      textMargin: 4,
      background: '#ffffff',
      lineColor: '#000000',
      margin: 5,
    });

    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error generating barcode:', error);
    return null;
  }
};

// Generate QR Code as PNG buffer
const generateQRCode = async (text) => {
  try {
    const qrBuffer = await QRCode.toBuffer(text, {
      type: 'png',
      width: 80,
      margin: 1,
      color: {
        dark: '#1a1a2e',
        light: '#ffffff',
      },
    });
    return qrBuffer;
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
};

// Layout configurations
const layouts = {
  '4-per-page': { 
    labelsPerPage: 4, cols: 2, rows: 2, 
    marginX: 18, marginY: 30, gapX: 15, gapY: 20, 
    labelWidth: 270, labelHeight: 380,
    pageWidth: 595.28, pageHeight: 841.89,
    isA4Layout: true,
    scale: 1.0,
  },
  '6-per-page': { 
    labelsPerPage: 6, cols: 2, rows: 3, 
    marginX: 15, marginY: 20, gapX: 12, gapY: 15, 
    labelWidth: 275, labelHeight: 245,
    pageWidth: 595.28, pageHeight: 841.89,
    isA4Layout: true,
    scale: 0.7,
  },
  '8-per-page-1': { 
    labelsPerPage: 8, cols: 2, rows: 4, 
    marginX: 12, marginY: 15, gapX: 10, gapY: 12, 
    labelWidth: 280, labelHeight: 185,
    pageWidth: 595.28, pageHeight: 841.89,
    isA4Layout: true,
    scale: 0.55,
  },
  '8-per-page-2': { 
    labelsPerPage: 8, cols: 2, rows: 4, 
    marginX: 12, marginY: 15, gapX: 10, gapY: 12, 
    labelWidth: 280, labelHeight: 185,
    pageWidth: 595.28, pageHeight: 841.89,
    isA4Layout: true,
    scale: 0.6,
  },
  '10x10': { 
    labelsPerPage: 1, cols: 1, rows: 1,
    marginX: 0, marginY: 0, gapX: 0, gapY: 0,
    labelWidth: 283.465, labelHeight: 283.465,
    pageWidth: 283.465, pageHeight: 283.465,
    isA4Layout: false,
    scale: 0.8,
  },
  '10x15': { 
    labelsPerPage: 1, cols: 1, rows: 1,
    marginX: 0, marginY: 0, gapX: 0, gapY: 0,
    labelWidth: 283.465, labelHeight: 425.197,
    pageWidth: 283.465, pageHeight: 425.197,
    isA4Layout: false,
    scale: 0.8,
  },
  '7.6x5': { 
    labelsPerPage: 1, cols: 1, rows: 1,
    marginX: 0, marginY: 0, gapX: 0, gapY: 0,
    labelWidth: 215.433, labelHeight: 141.732,
    pageWidth: 215.433, pageHeight: 141.732,
    isA4Layout: false,
    scale: 0.6,
  },
};

// Generate a single label on a page
const generateLabelOnPage = async (page, x, y, width, height, data) => {
  const { 
    doNumber, barcodeText, customerName, address, companyName, 
    boxNumber, totalBoxes, phone, instructions, config 
  } = data;
  
  const font = await page.doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await page.doc.embedFont(StandardFonts.HelveticaBold);

  const scale = config.scale || 1.0;

  const labelPadding = 6 * scale;
  const orderFontSize = 10 * scale;
  const shipToLabelSize = 7 * scale;
  const customerNameSize = 11 * scale;
  const phoneSize = 8 * scale;
  const addressSize = 8 * scale;
  const instructionLabelSize = 6 * scale;
  const instructionTextSize = 8 * scale;
  const qrSize = 55 * scale;
  const barcodeHeight = 55 * scale;
  const addressSpacing = 7 * scale;
  const maxAddressLines = 6;
  const addressCharsPerLine = Math.floor(30 / scale);

  const margin = labelPadding;
  const left = x + margin;
  const right = x + width - margin;
  const top = y + margin;
  const bottom = y + height - margin;
  const usableWidth = width - (margin * 2);

  page.drawRectangle({ x: x, y: y, width: width, height: height, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: x, y: y, width: width, height: height, borderColor: rgb(0.8, 0.8, 0.85), borderWidth: 1 });
  
  page.drawRectangle({
    x: x,
    y: y + height - (4 * scale),
    width: width,
    height: 4 * scale,
    color: rgb(0.15, 0.3, 0.6),
  });
  
  page.drawRectangle({
    x: x,
    y: y,
    width: 4 * scale,
    height: height,
    color: rgb(0.15, 0.3, 0.6),
  });

  let logoHeight = 0;
  let logoWidth = 0;
  try {
    const logoPath = path.join(__dirname, '../../logo.png');
    if (fs.existsSync(logoPath)) {
      const logoImage = await page.doc.embedPng(fs.readFileSync(logoPath));
      logoWidth = 100 * scale;
      logoHeight = 40 * scale;
      const logoX = left;
      const logoY = y + height - (60 * scale);
      page.drawImage(logoImage, {
        x: logoX,
        y: logoY,
        width: logoWidth,
        height: logoHeight,
      });
    }
  } catch (error) {
    // Logo not found, skip
  }

  const orderIdY = y + height - (18 * scale);
  page.drawText(`ORDER: ${doNumber}`, {
    x: right - (130 * scale),
    y: orderIdY,
    size: orderFontSize,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });

  const barcodeBuffer = await generateBarcode(barcodeText);
  if (barcodeBuffer) {
    try {
      const barcodeImage = await page.doc.embedPng(barcodeBuffer);
      const bw = Math.min(usableWidth - (20 * scale), 180 * scale);
      const bh = Math.max(20 * scale, barcodeHeight);
      const barcodeX = left;
      const barcodeY = y + height - (60 * scale) - logoHeight - (30 * scale);
      page.drawImage(barcodeImage, {
        x: barcodeX,
        y: barcodeY,
        width: bw,
        height: bh,
      });
    } catch (e) {}
  }

  const qrBuffer = await generateQRCode(barcodeText);
  const qrSizeActual = Math.max(25 * scale, qrSize);
  const qrX = right - qrSizeActual - (10 * scale);
  const qrY = y + height - (85 * scale);
  
  if (qrBuffer) {
    try {
      const qrImage = await page.doc.embedPng(qrBuffer);
      page.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: qrSizeActual,
        height: qrSizeActual,
      });
      page.drawText('SCAN QR', {
        x: qrX + qrSizeActual / 2 - (18 * scale),
        y: qrY - (10 * scale),
        size: 5 * scale,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });
    } catch (e) {}
  }

  const boxY = y + height - (35 * scale);
  page.drawText(`BOX ${boxNumber}/${totalBoxes}`, {
    x: right - (100 * scale),
    y: boxY,
    size: 8 * scale,
    font: fontBold,
    color: rgb(0.15, 0.3, 0.6),
  });

  let addressY = y + height - (160 * scale) - logoHeight;
  
  page.drawText('SHIP TO:', {
    x: left,
    y: addressY,
    size: shipToLabelSize,
    font: fontBold,
    color: rgb(0.5, 0.5, 0.5),
  });
  addressY -= (12 * scale);

  page.drawText(customerName || 'Customer', {
    x: left,
    y: addressY,
    size: customerNameSize,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  addressY -= (10 * scale);

  if (phone) {
    page.drawText(`Phone: ${phone}`, {
      x: left,
      y: addressY,
      size: phoneSize,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    addressY -= (8 * scale);
  }

  if (address) {
    const cleanAddress = address.replace(/\s+/g, ' ').trim();
    const maxChars = addressCharsPerLine || 30;
    
    const parts = cleanAddress.split(',').map(p => p.trim()).filter(p => p.length > 0);
    let addressLines = [];
    
    if (parts.length > 1) {
      let currentLine = '';
      for (const part of parts) {
        if ((currentLine + ', ' + part).length <= maxChars && currentLine !== '') {
          currentLine += ', ' + part;
        } else if (currentLine === '') {
          currentLine = part;
        } else {
          addressLines.push(currentLine);
          currentLine = part;
        }
      }
      if (currentLine) addressLines.push(currentLine);
    } else {
      const words = cleanAddress.split(' ');
      let currentLine = '';
      for (const word of words) {
        if ((currentLine + ' ' + word).length <= maxChars) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (currentLine) addressLines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) addressLines.push(currentLine);
    }
    
    const maxLines = Math.min(addressLines.length, maxAddressLines);
    for (let i = 0; i < maxLines && addressY > top + (30 * scale); i++) {
      page.drawText(addressLines[i], {
        x: left,
        y: addressY,
        size: addressSize,
        font: font,
        color: rgb(0.2, 0.2, 0.2),
      });
      addressY -= addressSpacing;
    }
  }

  if (instructions && instructions.trim()) {
    const instrY = addressY - (15 * scale);
    
    if (instrY > top + (15 * scale)) {
      page.drawText('INSTRUCTIONS:', {
        x: left,
        y: instrY,
        size: instructionLabelSize,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
      });
      
      const instrMaxChars = Math.floor((usableWidth - (10 * scale)) / (instructionTextSize * 0.4));
      const words = instructions.split(' ');
      let lines = [];
      let currentLine = '';
      
      for (const word of words) {
        if ((currentLine + ' ' + word).length <= instrMaxChars) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);
      
      const maxInstrLines = Math.min(lines.length, 3);
      let instrTextY = instrY - (12 * scale);
      
      for (let i = 0; i < maxInstrLines && instrTextY > top + (15 * scale); i++) {
        let displayText = lines[i];
        if (i === maxInstrLines - 1 && lines.length > maxInstrLines) {
          displayText = displayText.substring(0, Math.max(3, displayText.length - 3)) + '...';
        }
        page.drawText(displayText, {
          x: left,
          y: instrTextY,
          size: instructionTextSize,
          font: font,
          color: rgb(0.2, 0.2, 0.2),
        });
        instrTextY -= instructionTextSize + (3 * scale);
      }
    }
  }
};

// Generate shipping labels
const generateShippingLabels = async (doNumber, barcodes, customerName, address, companyName = '', phone = '', instructions = '', layout = '4-per-page') => {
  const pdfDoc = await PDFDocument.create();
  
  const config = layouts[layout] || layouts['4-per-page'];
  const { 
    labelsPerPage, cols, rows, marginX, marginY, gapX, gapY, 
    labelWidth, labelHeight, pageWidth, pageHeight, isA4Layout,
  } = config;

  if (!isA4Layout) {
    for (let i = 0; i < barcodes.length; i++) {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      
      const labelData = {
        doNumber,
        barcodeText: barcodes[i],
        customerName,
        address,
        companyName,
        boxNumber: i + 1,
        totalBoxes: barcodes.length,
        phone,
        instructions,
        config,
      };
      
      await generateLabelOnPage(page, 0, 0, pageWidth, pageHeight, labelData);
    }
    return pdfDoc;
  }

  for (let i = 0; i < barcodes.length; i++) {
    const positionInPage = i % labelsPerPage;
    const col = positionInPage % cols;
    const row = Math.floor(positionInPage / cols);

    const x = marginX + col * (labelWidth + gapX);
    const y = pageHeight - marginY - (row + 1) * labelHeight - row * gapY;

    if (i % labelsPerPage === 0) {
      pdfDoc.addPage([pageWidth, pageHeight]);
    }

    const page = pdfDoc.getPages()[pdfDoc.getPages().length - 1];

    const labelData = {
      doNumber,
      barcodeText: barcodes[i],
      customerName,
      address,
      companyName,
      boxNumber: i + 1,
      totalBoxes: barcodes.length,
      phone,
      instructions,
      config,
    };

    await generateLabelOnPage(page, x, y, labelWidth, labelHeight, labelData);
  }

  return pdfDoc;
};

module.exports = {
  generateBarcode,
  generateQRCode,
  generateShippingLabels,
  layouts
};