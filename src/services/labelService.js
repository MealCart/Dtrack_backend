// src/services/labelService.js

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const { createCanvas } = require('canvas');
const JsBarcode = require('jsbarcode');
const path = require('path');
const fs = require('fs');

/* --------------------------------------------------------------------------
 * COLORS
 * ------------------------------------------------------------------------ */

const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const GRAY = rgb(0.25, 0.25, 0.25);
const LIGHT_GRAY = rgb(0.55, 0.55, 0.55);

/* --------------------------------------------------------------------------
 * PAGE SIZE
 * ------------------------------------------------------------------------ */

const CM = 28.3464567;
const LABEL_WIDTH = 10 * CM;
const LABEL_HEIGHT = 15 * CM;

/* --------------------------------------------------------------------------
 * LAYOUT CONFIGURATIONS
 * ------------------------------------------------------------------------ */

const layouts = {
  '4-per-page': {
    labelsPerPage: 4,
    cols: 2,
    rows: 2,
    marginX: 18,
    marginY: 30,
    gapX: 15,
    gapY: 20,
    labelWidth: 270,
    labelHeight: 380,
    pageWidth: 595.28,
    pageHeight: 841.89,
    isA4Layout: true,
    scale: 1.0,
  },
  '6-per-page': {
    labelsPerPage: 6,
    cols: 2,
    rows: 3,
    marginX: 15,
    marginY: 20,
    gapX: 12,
    gapY: 15,
    labelWidth: 275,
    labelHeight: 245,
    pageWidth: 595.28,
    pageHeight: 841.89,
    isA4Layout: true,
    scale: 0.7,
  },
  '8-per-page-1': {
    labelsPerPage: 8,
    cols: 2,
    rows: 4,
    marginX: 12,
    marginY: 15,
    gapX: 10,
    gapY: 12,
    labelWidth: 280,
    labelHeight: 185,
    pageWidth: 595.28,
    pageHeight: 841.89,
    isA4Layout: true,
    scale: 0.55,
  },
  '8-per-page-2': {
    labelsPerPage: 8,
    cols: 2,
    rows: 4,
    marginX: 12,
    marginY: 15,
    gapX: 10,
    gapY: 12,
    labelWidth: 280,
    labelHeight: 185,
    pageWidth: 595.28,
    pageHeight: 841.89,
    isA4Layout: true,
    scale: 0.6,
  },
  '10x10': {
    labelsPerPage: 1,
    cols: 1,
    rows: 1,
    marginX: 0,
    marginY: 0,
    gapX: 0,
    gapY: 0,
    labelWidth: 10 * CM,
    labelHeight: 10 * CM,
    pageWidth: 10 * CM,
    pageHeight: 10 * CM,
    isA4Layout: false,
    scale: 1,
  },
  '10x15': {
    labelsPerPage: 1,
    cols: 1,
    rows: 1,
    marginX: 0,
    marginY: 0,
    gapX: 0,
    gapY: 0,
    labelWidth: LABEL_WIDTH,
    labelHeight: LABEL_HEIGHT,
    pageWidth: LABEL_WIDTH,
    pageHeight: LABEL_HEIGHT,
    isA4Layout: false,
    scale: 1,
  },
  '7.6x5': {
    labelsPerPage: 1,
    cols: 1,
    rows: 1,
    marginX: 0,
    marginY: 0,
    gapX: 0,
    gapY: 0,
    labelWidth: 7.6 * CM,
    labelHeight: 5 * CM,
    pageWidth: 7.6 * CM,
    pageHeight: 5 * CM,
    isA4Layout: false,
    scale: 0.6,
  },
};

/* --------------------------------------------------------------------------
 * HELPER FUNCTIONS
 * ------------------------------------------------------------------------ */

const drawHorizontalLine = (page, x1, x2, y, width = 0.8) => {
  page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness: width,
    color: BLACK,
  });
};

const drawVerticalLine = (page, x, y1, y2, width = 0.8) => {
  page.drawLine({
    start: { x, y: y1 },
    end: { x, y: y2 },
    thickness: width,
    color: BLACK,
  });
};

const drawCenteredText = (page, text, centerX, y, options) => {
  const { font, size, color = BLACK } = options;
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: centerX - textWidth / 2,
    y,
    size,
    font,
    color,
  });
};

const drawRightText = (page, text, rightX, y, options) => {
  const { font, size, color = BLACK } = options;
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: rightX - textWidth,
    y,
    size,
    font,
    color,
  });
};

const wrapText = (text, font, fontSize, maxWidth) => {
  if (!text) return [];
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];

  const breakLongWord = (word) => {
    const chunks = [];
    let current = '';
    for (const character of String(word)) {
      const test = current + character;
      if (!current || font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
        current = test;
      } else {
        chunks.push(current);
        current = character;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  };

  let currentLine = '';
  for (const word of words) {
    const wordParts = font.widthOfTextAtSize(word, fontSize) > maxWidth ? breakLongWord(word) : [word];
    for (const part of wordParts) {
      const testLine = currentLine ? `${currentLine} ${part}` : part;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = part;
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
};

const fitTextSize = (text, font, maxWidth, maxSize, minSize = 5, step = 0.25) => {
  const value = String(text || '').trim();
  if (!value) return maxSize;
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(value, size) > maxWidth) {
    size -= step;
  }
  return Math.max(minSize, Number(size.toFixed(2)));
};

const fitWrappedText = (text, font, maxWidth, maxHeight, maxSize, minSize = 5, maxLines = Infinity, lineHeightFactor = 1.2) => {
  const value = String(text || '').trim();
  if (!value) {
    return { size: maxSize, lines: [], lineHeight: maxSize * lineHeightFactor };
  }
  let size = maxSize;
  while (size >= minSize) {
    const lines = wrapText(value, font, size, maxWidth);
    const lineHeight = size * lineHeightFactor;
    const totalHeight = lines.length * lineHeight;
    if (lines.length <= maxLines && totalHeight <= maxHeight) {
      return { size: Number(size.toFixed(2)), lines, lineHeight };
    }
    size -= 0.25;
  }
  const finalSize = minSize;
  const finalLines = wrapText(value, font, finalSize, maxWidth);
  return { size: finalSize, lines: finalLines, lineHeight: finalSize * lineHeightFactor };
};

/* --------------------------------------------------------------------------
 * GENERATE BARCODE & QR CODE
 * ------------------------------------------------------------------------ */

const generateBarcode = async (text) => {
  try {
    const canvas = createCanvas(900, 220);
    JsBarcode(canvas, String(text), {
      format: 'CODE128',
      width: 2.5,
      height: 130,
      displayValue: true,
      fontSize: String(text).length > 28 ? 22 : String(text).length > 20 ? 26 : 32,
      font: 'Arial',
      textAlign: 'center',
      textPosition: 'bottom',
      textMargin: 8,
      background: '#ffffff',
      lineColor: '#000000',
      margin: 8,
    });
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error generating barcode:', error);
    return null;
  }
};

const generateQRCode = async (text) => {
  try {
    const qrBuffer = await QRCode.toBuffer(String(text), {
      type: 'png',
      width: 400,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
    return qrBuffer;
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
};

const loadLogo = async (pdfDoc) => {
  try {
    const logoPath = path.join(__dirname, '../../logo.png');
    if (!fs.existsSync(logoPath)) return null;
    const logoBuffer = fs.readFileSync(logoPath);
    return await pdfDoc.embedPng(logoBuffer);
  } catch (error) {
    console.error('Error loading logo:', error);
    return null;
  }
};

/* --------------------------------------------------------------------------
 * DRAW LABEL SECTIONS
 * ------------------------------------------------------------------------ */

const drawTopSection = async (page, pdfDoc, x, y, width, height, barcodeText, fonts) => {
  const { font, fontBold } = fonts;
  const left = x;
  const right = x + width;
  const top = y + height;
  const bottom = y;

  page.drawRectangle({
    x, y, width, height,
    borderColor: BLACK,
    borderWidth: 0.8,
    color: WHITE,
  });

  const dividerX = x + width * 0.60;
  drawVerticalLine(page, dividerX, bottom, top, 0.8);

  const qrBuffer = await generateQRCode(barcodeText);
  if (qrBuffer) {
    try {
      const qrImage = await pdfDoc.embedPng(qrBuffer);
      const rightSectionWidth = right - dividerX;
      const qrSize = Math.min(76, rightSectionWidth - 20, height - 16);
      const qrX = dividerX + (rightSectionWidth - qrSize) / 2;
      const qrY = bottom + (height - qrSize) / 2;
      page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    } catch (error) {
      console.error('Error embedding QR code:', error);
    }
  }
  return { dividerX };
};

const drawCustomerNameSection = (page, x, y, width, height, customerName, fonts) => {
  const { fontBold } = fonts;
  page.drawRectangle({
    x, y, width, height,
    borderColor: BLACK,
    borderWidth: 0.8,
    color: WHITE,
  });

  const name = String(customerName || 'Customer').replace(/\s+/g, ' ').trim();
  const paddingX = 8;
  const maxWidth = width - paddingX * 2;
  const fontSize = fitTextSize(name, fontBold, maxWidth, 18, 7);
  drawCenteredText(page, name, x + width / 2, y + (height - fontSize) / 2 + 2, {
    font: fontBold,
    size: fontSize,
    color: BLACK,
  });
};

const drawAddressSection = (page, x, y, width, height, data, fonts, logoImage) => {
  const { font, fontBold } = fonts;
  const { address, companyName, phone, state, postcode, city } = data;

  // 👇 DEBUG: Log state value
  console.log('📍 STATE VALUE RECEIVED:', state);

  page.drawRectangle({
    x, y, width, height,
    borderColor: BLACK,
    borderWidth: 0.8,
    color: WHITE,
  });

  const logoSectionWidth = Math.min(92, width * 0.22);
  const contentWidth = width - logoSectionWidth;
  drawVerticalLine(page, x + contentWidth, y, y + height, 0.8);

  const paddingX = 8;
  const paddingTop = 8;
  const paddingBottom = 6;
  const textX = x + paddingX;
  const availableTextWidth = contentWidth - paddingX * 2;
  const availableTextHeight = height - paddingTop - paddingBottom;

  const cleanCompany = companyName ? String(companyName).replace(/\s+/g, ' ').trim() : '';
  const cleanAddress = address ? String(address).replace(/\s+/g, ' ').trim() : '';
  const cleanPhone = phone ? String(phone).replace(/\s+/g, ' ').trim() : '';

  const locationParts = [];
  if (city) locationParts.push(String(city).trim());
  if (state) locationParts.push(String(state).trim());
  if (postcode) locationParts.push(String(postcode).trim());
  const locationText = locationParts.filter(Boolean).join(' ');

  let companySize = cleanCompany ? Math.min(8.5, height * 0.12) : 0;
  let addressSize = cleanAddress ? Math.min(11, height * 0.16) : 0;
  let locationSize = locationText ? Math.min(8.5, height * 0.12) : 0;
  let phoneSize = cleanPhone ? Math.min(11, height * 0.16) : 0;

  const calculateContent = () => {
    const addressLines = cleanAddress ? wrapText(cleanAddress, fontBold, addressSize, availableTextWidth) : [];
    const companyLines = cleanCompany ? wrapText(cleanCompany, fontBold, companySize, availableTextWidth) : [];
    const locationLines = locationText ? wrapText(locationText, fontBold, locationSize, availableTextWidth) : [];
    const phoneLines = cleanPhone ? wrapText(cleanPhone, fontBold, phoneSize, availableTextWidth) : [];

    const companyLineCount = companyLines.length;
    const addressLineCount = addressLines.length;
    const locationLineCount = locationLines.length;
    const phoneLineCount = phoneLines.length;

    const companyHeight = companyLineCount > 0 ? companyLineCount * companySize * 1.12 : 0;
    const addressHeight = addressLineCount > 0 ? addressLineCount * addressSize * 1.12 : 0;
    const locationHeight = locationLineCount > 0 ? locationLineCount * locationSize * 1.15 : 0;
    const phoneHeight = phoneLineCount > 0 ? phoneLineCount * phoneSize * 1.12 : 0;
    const groupGaps = Math.max(0, companyLineCount) + Math.max(0, addressLineCount) + Math.max(0, locationLineCount);
    const totalHeight = companyHeight + addressHeight + locationHeight + phoneHeight + groupGaps * 1.2;
    return { companyLines, addressLines, locationLines, phoneLines, totalHeight };
  };

  let content = calculateContent();

  while (content.totalHeight > availableTextHeight && (addressSize > 5.5 || phoneSize > 7 || locationSize > 6.5)) {
    if (addressSize >= phoneSize && addressSize > 5.5) addressSize -= 0.25;
    else if (phoneSize > 7) phoneSize -= 0.25;
    else if (locationSize > 6.5) locationSize -= 0.25;
    else if (addressSize > 5.5) addressSize -= 0.25;
    content = calculateContent();
  }

  if (cleanCompany) {
    companySize = fitTextSize(cleanCompany, fontBold, availableTextWidth, companySize || 8.5, 5.5);
  }
  content = calculateContent();

  let textY = y + height - paddingTop - companySize;

  if (cleanCompany) {
    const companyLines = wrapText(cleanCompany, fontBold, companySize, availableTextWidth);
    for (const line of companyLines) {
      page.drawText(line, { x: textX, y: textY, size: companySize, font: fontBold, color: BLACK });
      textY -= companySize * 1.12;
    }
    textY -= 1.2;
  }

  if (cleanAddress) {
    const addressLines = wrapText(cleanAddress, fontBold, addressSize, availableTextWidth);
    for (const line of addressLines) {
      page.drawText(line, { x: textX, y: textY, size: addressSize, font: fontBold, color: BLACK });
      textY -= addressSize * 1.12;
    }
    textY -= 1.2;
  }

  if (locationText) {
    const fittedLocationSize = fitTextSize(locationText, fontBold, availableTextWidth, locationSize, 5.5);
    const locationLines = wrapText(locationText, fontBold, fittedLocationSize, availableTextWidth);
    for (const line of locationLines) {
      page.drawText(line, { x: textX, y: textY, size: fittedLocationSize, font: fontBold, color: BLACK });
      textY -= fittedLocationSize * 1.15;
    }
    textY -= 1.2;
  }

  if (cleanPhone) {
    const fittedPhoneSize = fitTextSize(cleanPhone, fontBold, availableTextWidth, phoneSize, 6.5);
    const phoneLines = wrapText(cleanPhone, fontBold, fittedPhoneSize, availableTextWidth);
    for (const line of phoneLines) {
      page.drawText(line, { x: textX, y: textY, size: fittedPhoneSize, font: fontBold, color: BLACK });
      textY -= fittedPhoneSize * 1.12;
    }
  }

  // ============================================================
  // LOGO AREA - STATE ABOVE LOGO (FIXED)
  // ============================================================
  const logoAreaX = x + contentWidth;
  const logoAreaWidth = logoSectionWidth;
  const logoAreaHeight = height;

  // ---- SECTION 1: STATE (Top 50% of logo area) ----
  // 👇 FIX: Use state directly from data
  let displayState = state ? String(state).trim() : '';
  
  // 👇 FALLBACK: If state is empty, try to extract from locationText
  if (!displayState && locationText) {
    const parts = locationText.split(' ');
    // Look for common state names
    const commonStates = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT', 
                          'New South Wales', 'Victoria', 'Queensland', 'Western Australia', 
                          'South Australia', 'Tasmania', 'Australian Capital Territory', 
                          'Northern Territory'];
    for (const part of parts) {
      if (commonStates.includes(part)) {
        displayState = part;
        break;
      }
    }
  }
  
  // 👇 FINAL FALLBACK: Show "N/A" if still empty
  if (!displayState) {
    displayState = 'N/A';
  }

  console.log('📍 DISPLAY STATE:', displayState);

  // State section (top half)
  const stateSectionHeight = logoAreaHeight * 0.48;

  // Draw state section with background
  page.drawRectangle({
    x: logoAreaX,
    y: y + logoAreaHeight - stateSectionHeight,
    width: logoAreaWidth,
    height: stateSectionHeight,
    borderColor: BLACK,
    borderWidth: 0.5,
    color: WHITE,
  });

  // Draw state text
  const stateMaxWidth = logoAreaWidth - 10;
  const stateFontSize = fitTextSize(displayState, fontBold, stateMaxWidth, Math.min(24, stateSectionHeight * 0.7), 8);
  const stateTextHeight = stateFontSize;
  const stateCenterX = logoAreaX + logoAreaWidth / 2;
  const stateY = y + logoAreaHeight - stateSectionHeight / 2 - stateTextHeight / 2;

  drawCenteredText(page, displayState, stateCenterX, stateY, {
    font: fontBold,
    size: stateFontSize,
    color: BLACK,
  });

  // Draw horizontal divider line between state and logo
  drawHorizontalLine(
    page,
    logoAreaX + 2,
    logoAreaX + logoAreaWidth - 2,
    y + logoAreaHeight - stateSectionHeight,
    0.6
  );

  // ---- SECTION 2: LOGO (Bottom half) ----
  const logoSectionHeight = logoAreaHeight * 0.48;
  const logoSectionY = y + 2;

  if (logoImage) {
    try {
      const maxLogoWidth = Math.min(60, logoAreaWidth - 12);
      const maxLogoHeight = Math.min(38, logoSectionHeight - 4);

      const logoOriginalWidth = logoImage.width;
      const logoOriginalHeight = logoImage.height;
      const logoScale = Math.min(maxLogoWidth / logoOriginalWidth, maxLogoHeight / logoOriginalHeight);
      const logoWidth = logoOriginalWidth * logoScale;
      const logoHeight = logoOriginalHeight * logoScale;

      const logoX = logoAreaX + (logoAreaWidth - logoWidth) / 2;
      const logoY = logoSectionY + (logoSectionHeight - logoHeight) / 2;

      page.drawImage(logoImage, {
        x: logoX,
        y: logoY,
        width: logoWidth,
        height: logoHeight,
      });
    } catch (error) {
      console.error('Error drawing logo:', error);
    }
  }

  // 👇 DEBUG: Add state label below logo for verification (remove after testing)
  // page.drawText(`State: ${displayState}`, {
  //   x: logoAreaX + 4,
  //   y: y + 2,
  //   size: 5,
  //   font: font,
  //   color: GRAY,
  // });
};

const drawInstructionsSection = (page, x, y, width, height, instructions, fonts) => {
  const { font, fontBold } = fonts;

  page.drawRectangle({
    x, y, width, height,
    borderColor: BLACK,
    borderWidth: 0.8,
    color: WHITE,
  });

  drawCenteredText(page, 'INSTRUCTIONS', x + width / 2, y + height - 13, {
    font: fontBold,
    size: Math.min(9, height * 0.16),
    color: BLACK,
  });

  if (instructions && String(instructions).trim()) {
    const padding = 9;
    const maxWidth = width - padding * 2;
    const titleSpace = 24;
    const availableHeight = height - titleSpace - 5;
    const fitted = fitWrappedText(
      String(instructions).trim(),
      font,
      maxWidth,
      availableHeight,
      Math.min(8.5, height * 0.15),
      5.5,
      Infinity,
      1.25
    );
    let textY = y + height - titleSpace;
    for (const line of fitted.lines) {
      page.drawText(line, { x: x + padding, y: textY, size: fitted.size, font, color: BLACK });
      textY -= fitted.lineHeight;
    }
  } else {
    drawCenteredText(page, '', x + width / 2, y + height / 2, { font, size: 8 });
  }
};

const drawDeclarationSection = (page, x, y, width, height, data, fonts) => {
  const { font, fontBold } = fonts;
  const { boxNumber, totalBoxes } = data;

  page.drawRectangle({
    x, y, width, height,
    borderColor: BLACK,
    borderWidth: 0.8,
    color: WHITE,
  });

  const rightSectionWidth = Math.min(110, width * 0.22);
  const leftWidth = width - rightSectionWidth;
  drawVerticalLine(page, x + leftWidth, y, y + height, 0.8);

  const heading = 'Sender Declaration – Residential Deliveries';
  const headingSize = fitTextSize(heading, fontBold, leftWidth - 8, Math.min(6.8, height * 0.12), 5);
  page.drawText(heading, { x: x + 4, y: y + height - 12, size: headingSize, font: fontBold, color: BLACK });
  drawHorizontalLine(page, x + 4, x + leftWidth - 4, y + height - 14, 0.5);

  const declaration = 'The sender acknowledges and authorises that residential deliveries may be left unattended at the delivery address, including at the doorstep or another location deemed safe by the driver, without obtaining a signature.';
  const declarationMaxWidth = leftWidth - 14;
  const declarationAvailableHeight = height - 25 - 5;
  const fitted = fitWrappedText(
    declaration,
    font,
    declarationMaxWidth,
    declarationAvailableHeight,
    Math.min(6.7, height * 0.12),
    4.5,
    Infinity,
    1.25
  );

  let declarationY = y + height - 25;
  for (const line of fitted.lines) {
    drawCenteredText(page, line, x + leftWidth / 2, declarationY, { font, size: fitted.size, color: BLACK });
    declarationY -= fitted.lineHeight;
  }

  const rightX = x + leftWidth;
  const rightWidth = rightSectionWidth;

  const boxText = `${boxNumber} of ${totalBoxes}`;
  const boxFontSize = fitTextSize(boxText, fontBold, rightWidth - 8, Math.min(22, height * 0.35), 9);
  drawCenteredText(page, boxText, rightX + rightWidth / 2, y + 17, {
    font: fontBold,
    size: boxFontSize,
    color: BLACK,
  });
};

const drawBarcodeSection = async (page, pdfDoc, x, y, width, height, barcodeText) => {
  const barcodeBuffer = await generateBarcode(barcodeText);
  if (!barcodeBuffer) return;

  try {
    const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);
    const paddingX = 8;
    const barcodeWidth = width - paddingX * 2;
    const barcodeHeight = height - 8;
    page.drawImage(barcodeImage, {
      x: x + paddingX,
      y: y + 4,
      width: barcodeWidth,
      height: barcodeHeight,
    });
  } catch (error) {
    console.error('Error drawing barcode:', error);
  }
};

/* --------------------------------------------------------------------------
 * GENERATE LABEL - SAME DESIGN FOR ALL SIZES
 * ------------------------------------------------------------------------ */

const generateLabelOnPage = async (page, x, y, width, height, data) => {
  const { doNumber, barcodeText, customerName, address, companyName, boxNumber, totalBoxes, phone, instructions, state, postcode, city, config } = data;

  const font = await page.doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await page.doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { font, fontBold };

  // Calculate scale based on label size relative to 10x15
  const baseWidth = 10 * CM;
  const baseHeight = 15 * CM;
  const scale = Math.min(width / baseWidth, height / baseHeight, 1.0);

  // Adjust section heights based on scale
  const topSectionHeight = Math.max(45, 92 * Math.min(scale, 1));
  const nameSectionHeight = Math.max(22, 39 * Math.min(scale, 1));
  const addressSectionHeight = Math.max(40, 74 * Math.min(scale, 1));
  const instructionsSectionHeight = Math.max(30, 55 * Math.min(scale, 1));
  const declarationSectionHeight = Math.max(35, 62 * Math.min(scale, 1));

  // Calculate barcode height (remaining space)
  const totalUsed = topSectionHeight + nameSectionHeight + addressSectionHeight + instructionsSectionHeight + declarationSectionHeight;
  const barcodeSectionHeight = Math.max(30, height - totalUsed - 10);

  // Draw white background and border
  page.drawRectangle({ x, y, width, height, color: WHITE });
  page.drawRectangle({
    x, y, width, height,
    borderColor: BLACK,
    borderWidth: Math.max(0.5, 1.5 * scale),
    color: WHITE,
  });

  let currentY = y + height;
  const margin = Math.max(4, 9 * scale);
  const usableWidth = width - margin * 2;

  // 1. TOP SECTION (QR Code)
  const topY = currentY - topSectionHeight;
  await drawTopSection(page, page.doc, x + margin, topY, usableWidth, topSectionHeight, barcodeText, fonts);
  currentY = topY;

  // 2. CUSTOMER NAME
  const nameY = currentY - nameSectionHeight;
  drawCustomerNameSection(page, x + margin, nameY, usableWidth, nameSectionHeight, customerName, fonts);
  currentY = nameY;

  // 3. ADDRESS SECTION
  const addressY = currentY - addressSectionHeight;
  const logoImage = await loadLogo(page.doc);
  drawAddressSection(page, x + margin, addressY, usableWidth, addressSectionHeight, data, fonts, logoImage);
  currentY = addressY;

  // 4. INSTRUCTIONS
  const instructionsY = currentY - instructionsSectionHeight;
  drawInstructionsSection(page, x + margin, instructionsY, usableWidth, instructionsSectionHeight, instructions, fonts);
  currentY = instructionsY;

  // 5. DECLARATION
  const declarationY = currentY - declarationSectionHeight;
  drawDeclarationSection(page, x + margin, declarationY, usableWidth, declarationSectionHeight, data, fonts);
  currentY = declarationY;

  // 6. BARCODE
  const barcodeY = y + 2;
  await drawBarcodeSection(page, page.doc, x + margin, barcodeY, usableWidth, barcodeSectionHeight, barcodeText);
};

/* --------------------------------------------------------------------------
 * GENERATE SHIPPING LABELS - MAIN FUNCTION
 * ------------------------------------------------------------------------ */

const generateShippingLabels = async (
  doNumber,
  barcodes,
  customerName,
  address,
  companyName = '',
  phone = '',
  instructions = '',
  layout = '10x15',
  state = '',
  postcode = '',
  city = ''
) => {
  const pdfDoc = await PDFDocument.create();

  const barcodeList = Array.isArray(barcodes) ? barcodes : [barcodes];
  const validBarcodes = barcodeList.filter(
    (value) => value !== undefined && value !== null && String(value).trim() !== ''
  );

  if (validBarcodes.length === 0) {
    throw new Error('At least one barcode is required to generate a shipping label.');
  }

  const config = layouts[layout] || layouts['10x15'];
  const { labelsPerPage, cols, marginX, marginY, gapX, gapY, labelWidth, labelHeight, pageWidth, pageHeight, isA4Layout } = config;

  // For single-page labels (10x15, 10x10, 7.6x5)
  if (!isA4Layout) {
    for (let i = 0; i < validBarcodes.length; i++) {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      const labelData = {
        doNumber,
        barcodeText: String(validBarcodes[i]),
        customerName,
        address,
        companyName,
        boxNumber: i + 1,
        totalBoxes: validBarcodes.length,
        phone,
        instructions,
        state,
        postcode,
        city,
        config,
      };
      await generateLabelOnPage(page, 0, 0, pageWidth, pageHeight, labelData);
    }
    return pdfDoc;
  }

  // For A4 multi-label layouts (4-per-page, 6-per-page, 8-per-page)
  for (let i = 0; i < validBarcodes.length; i++) {
    const positionInPage = i % labelsPerPage;
    const col = positionInPage % cols;
    const row = Math.floor(positionInPage / cols);

    if (i % labelsPerPage === 0) {
      pdfDoc.addPage([pageWidth, pageHeight]);
    }

    const page = pdfDoc.getPages()[pdfDoc.getPages().length - 1];
    const x = marginX + col * (labelWidth + gapX);
    const y = pageHeight - marginY - (row + 1) * labelHeight - row * gapY;

    const labelData = {
      doNumber,
      barcodeText: String(validBarcodes[i]),
      customerName,
      address,
      companyName,
      boxNumber: i + 1,
      totalBoxes: validBarcodes.length,
      phone,
      instructions,
      state,
      postcode,
      city,
      config,
    };

    await generateLabelOnPage(page, x, y, labelWidth, labelHeight, labelData);
  }

  return pdfDoc;
};

/* --------------------------------------------------------------------------
 * EXPORTS
 * ------------------------------------------------------------------------ */

module.exports = {
  generateBarcode,
  generateQRCode,
  generateShippingLabels,
  layouts,
};