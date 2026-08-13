// src/services/labelService.js

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const { createCanvas } = require('canvas');
const JsBarcode = require('jsbarcode');
const path = require('path');
const fs = require('fs');

/*
|--------------------------------------------------------------------------
| 10 x 15 CM SHIPPING LABEL
|--------------------------------------------------------------------------
|
| PDF points:
| 1 cm = 28.3464567 points
|
| 10 cm = 283.464567
| 15 cm = 425.196850
|
|--------------------------------------------------------------------------
*/

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

  /*
   * Existing A4 layouts are retained so existing code does not break.
   */

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

  /*
   * EXACT 10 x 10 CM
   */
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

  /*
   * EXACT 10 x 15 CM
   */
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

  /*
   * 7.6 x 5 CM
   */
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
 * HELPER: DRAW HORIZONTAL LINE
 * ------------------------------------------------------------------------ */

const drawHorizontalLine = (page, x1, x2, y, width = 0.8) => {
  page.drawLine({
    start: {
      x: x1,
      y,
    },
    end: {
      x: x2,
      y,
    },
    thickness: width,
    color: BLACK,
  });
};


/* --------------------------------------------------------------------------
 * HELPER: DRAW VERTICAL LINE
 * ------------------------------------------------------------------------ */

const drawVerticalLine = (page, x, y1, y2, width = 0.8) => {
  page.drawLine({
    start: {
      x,
      y: y1,
    },
    end: {
      x,
      y: y2,
    },
    thickness: width,
    color: BLACK,
  });
};


/* --------------------------------------------------------------------------
 * HELPER: CENTER TEXT
 * ------------------------------------------------------------------------ */

const drawCenteredText = (
  page,
  text,
  centerX,
  y,
  options
) => {

  const {
    font,
    size,
    color = BLACK,
  } = options;

  const textWidth = font.widthOfTextAtSize(text, size);

  page.drawText(text, {
    x: centerX - textWidth / 2,
    y,
    size,
    font,
    color,
  });
};


/* --------------------------------------------------------------------------
 * HELPER: RIGHT ALIGN TEXT
 * ------------------------------------------------------------------------ */

const drawRightText = (
  page,
  text,
  rightX,
  y,
  options
) => {

  const {
    font,
    size,
    color = BLACK,
  } = options;

  const textWidth = font.widthOfTextAtSize(text, size);

  page.drawText(text, {
    x: rightX - textWidth,
    y,
    size,
    font,
    color,
  });
};


/* --------------------------------------------------------------------------
 * HELPER: WRAP TEXT BY ACTUAL PDF WIDTH
 * ------------------------------------------------------------------------ */

const wrapText = (
  text,
  font,
  fontSize,
  maxWidth
) => {

  if (!text) {
    return [];
  }

  const words = String(text)
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');

  const lines = [];

  let currentLine = '';

  for (const word of words) {

    const testLine = currentLine
      ? `${currentLine} ${word}`
      : word;

    const width = font.widthOfTextAtSize(
      testLine,
      fontSize
    );

    if (width <= maxWidth) {

      currentLine = testLine;

    } else {

      if (currentLine) {
        lines.push(currentLine);
      }

      /*
       * If a single word is too long, keep it anyway.
       */
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};


/* --------------------------------------------------------------------------
 * GENERATE CODE128 BARCODE
 * ------------------------------------------------------------------------ */

const generateBarcode = async (text) => {

  try {

    /*
     * Large canvas so barcode remains sharp when printed.
     */

    const canvas = createCanvas(900, 220);

    JsBarcode(canvas, String(text), {

      format: 'CODE128',

      width: 3,

      height: 130,

      displayValue: true,

      fontSize: 32,

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

    console.error(
      'Error generating barcode:',
      error
    );

    return null;
  }
};


/* --------------------------------------------------------------------------
 * GENERATE QR CODE
 * ------------------------------------------------------------------------ */

const generateQRCode = async (text) => {

  try {

    const qrBuffer = await QRCode.toBuffer(
      String(text),
      {

        type: 'png',

        width: 400,

        margin: 1,

        errorCorrectionLevel: 'M',

        color: {
          dark: '#000000',
          light: '#ffffff',
        },

      }
    );

    return qrBuffer;

  } catch (error) {

    console.error(
      'Error generating QR code:',
      error
    );

    return null;
  }
};


/* --------------------------------------------------------------------------
 * LOAD LOGO
 *
 * The original logo is used if available.
 *
 * NOTE:
 * If your logo is colored, it will remain colored.
 * For a strictly black/white label, use a black/white logo.png.
 * ------------------------------------------------------------------------ */

const loadLogo = async (pdfDoc) => {

  try {

    const logoPath = path.join(
      __dirname,
      '../../logo.png'
    );

    if (!fs.existsSync(logoPath)) {
      return null;
    }

    const logoBuffer = fs.readFileSync(
      logoPath
    );

    return await pdfDoc.embedPng(
      logoBuffer
    );

  } catch (error) {

    console.error(
      'Error loading logo:',
      error
    );

    return null;
  }
};


/* --------------------------------------------------------------------------
 * DRAW TOP SECTION
 *
 * Reference:
 *
 * +------------------------+------------+
 * |                        |            |
 * |                        |    QR      |
 * |                        |            |
 * +------------------------+------------+
 * ------------------------------------------------------------------------ */

const drawTopSection = async (
  page,
  pdfDoc,
  x,
  y,
  width,
  height,
  barcodeText,
  fonts
) => {

  const {
    font,
    fontBold,
  } = fonts;

  const left = x;
  const right = x + width;
  const top = y + height;
  const bottom = y;

  /*
   * Main section border.
   */

  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: BLACK,
    borderWidth: 0.8,
    color: WHITE,
  });

  /*
   * Vertical divider.
   *
   * Reference is approximately 58% / 42%.
   */

  const dividerX = x + width * 0.60;

  drawVerticalLine(
    page,
    dividerX,
    bottom,
    top,
    0.8
  );

  /*
   * QR code.
   */

  const qrBuffer = await generateQRCode(
    barcodeText
  );

  if (qrBuffer) {

    try {

      const qrImage = await pdfDoc.embedPng(
        qrBuffer
      );

      /*
       * Keep QR comfortably inside the right section.
       */

      const rightSectionWidth =
        right - dividerX;

      const qrSize = Math.min(
        76,
        rightSectionWidth - 20,
        height - 16
      );

      const qrX =
        dividerX +
        (rightSectionWidth - qrSize) / 2;

      const qrY =
        bottom +
        (height - qrSize) / 2;

      page.drawImage(qrImage, {

        x: qrX,

        y: qrY,

        width: qrSize,

        height: qrSize,

      });

    } catch (error) {

      console.error(
        'Error embedding QR code:',
        error
      );
    }
  }

  /*
   * Optional blank left area intentionally remains blank,
   * matching the reference label.
   */

  return {
    dividerX,
  };
};


/* --------------------------------------------------------------------------
 * DRAW CUSTOMER NAME
 * ------------------------------------------------------------------------ */

const drawCustomerNameSection = (
  page,
  x,
  y,
  width,
  height,
  customerName,
  fonts
) => {

  const {
    fontBold,
  } = fonts;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: BLACK,
    borderWidth: 0.8,
    color: WHITE,
  });

  const name =
    customerName ||
    'Customer';

  /*
   * Large name like reference.
   */

  let fontSize = 18;

  /*
   * Reduce font for long names.
   */

  if (name.length > 28) {
    fontSize = 16;
  }

  if (name.length > 38) {
    fontSize = 14;
  }

  if (name.length > 48) {
    fontSize = 12;
  }

  drawCenteredText(
    page,
    name,
    x + width / 2,
    y + (height - fontSize) / 2 + 2,
    {
      font: fontBold,
      size: fontSize,
      color: BLACK,
    }
  );
};


/* --------------------------------------------------------------------------
 * DRAW ADDRESS / CONTACT SECTION
 * ------------------------------------------------------------------------ */

const drawAddressSection = (
  page,
  x,
  y,
  width,
  height,
  data,
  fonts,
  logoImage
) => {

  const {
    font,
    fontBold,
  } = fonts;

  const {
    address,
    companyName,
    phone,
  } = data;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: BLACK,
    borderWidth: 0.8,
    color: WHITE,
  });

  /*
   * Right side reserved for company logo.
   */

  const logoSectionWidth = 92;

  const contentWidth =
    width - logoSectionWidth;

  drawVerticalLine(
    page,
    x + contentWidth,
    y,
    y + height,
    0.8
  );

  /*
   * Left content.
   */

  const paddingX = 8;

  let textY =
    y + height - 20;

  const textX =
    x + paddingX;

  const availableTextWidth =
    contentWidth - paddingX * 2;

  /*
   * Optional company name / sender name.
   *
   * The reference mainly displays recipient
   * information in this section.
   */

  if (companyName) {

    page.drawText(
      String(companyName),
      {
        x: textX,
        y: textY,
        size: 8.5,
        font: fontBold,
        color: BLACK,
      }
    );

    textY -= 12;
  }

  /*
   * Address.
   */

  if (address) {

    const cleanAddress = String(address)
      .replace(/\s+/g, ' ')
      .trim();

    const addressLines = wrapText(
      cleanAddress,
      font,
      8.5,
      availableTextWidth
    );

    const maxAddressLines = 4;

    for (
      let i = 0;
      i < Math.min(
        addressLines.length,
        maxAddressLines
      );
      i++
    ) {

      page.drawText(
        addressLines[i],
        {
          x: textX,
          y: textY,
          size: 8.5,
          font,
          color: BLACK,
        }
      );

      textY -= 11;
    }
  }

  /*
   * Phone.
   */

  if (phone) {

    textY -= 1;

    page.drawText(
      String(phone),
      {
        x: textX,
        y: textY,
        size: 8.5,
        font,
        color: BLACK,
      }
    );
  }

  /*
   * Email / other contact information is intentionally
   * not invented because it isn't part of the current
   * function parameters.
   */

  /*
   * Logo.
   */

  if (logoImage) {

    try {

      const logoAreaX =
        x + contentWidth;

      const logoAreaWidth =
        logoSectionWidth;

      const logoAreaHeight =
        height;

      const maxLogoWidth = 65;
      const maxLogoHeight = 45;

      /*
       * Use fixed dimensions for predictable label printing.
       */

      const logoWidth =
        maxLogoWidth;

      const logoHeight =
        maxLogoHeight;

      const logoX =
        logoAreaX +
        (logoAreaWidth - logoWidth) / 2;

      const logoY =
        y +
        (logoAreaHeight - logoHeight) / 2;

      page.drawImage(
        logoImage,
        {
          x: logoX,
          y: logoY,
          width: logoWidth,
          height: logoHeight,
        }
      );

    } catch (error) {

      console.error(
        'Error drawing logo:',
        error
      );
    }
  }
};


/* --------------------------------------------------------------------------
 * DRAW INSTRUCTIONS
 * ------------------------------------------------------------------------ */

const drawInstructionsSection = (
  page,
  x,
  y,
  width,
  height,
  instructions,
  fonts
) => {

  const {
    font,
    fontBold,
  } = fonts;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: BLACK,
    borderWidth: 0.8,
    color: WHITE,
  });

  /*
   * Title.
   */

  drawCenteredText(
    page,
    'INSTRUCTIONS',
    x + width / 2,
    y + height - 13,
    {
      font: fontBold,
      size: 9,
      color: BLACK,
    }
  );

  /*
   * Instruction text.
   */

  if (
    instructions &&
    String(instructions).trim()
  ) {

    const padding = 9;

    const maxWidth =
      width - padding * 2;

    const lines = wrapText(
      String(instructions).trim(),
      font,
      8.5,
      maxWidth
    );

    const lineHeight = 12;

    let textY =
      y + height - 29;

    const maxLines = 3;

    for (
      let i = 0;
      i < Math.min(lines.length, maxLines);
      i++
    ) {

      page.drawText(
        lines[i],
        {
          x: x + padding,
          y: textY,
          size: 8.5,
          font,
          color: BLACK,
        }
      );

      textY -= lineHeight;
    }

  } else {

    /*
     * Keep section visually consistent when
     * there are no instructions.
     */

    drawCenteredText(
      page,
      '',
      x + width / 2,
      y + height / 2,
      {
        font,
        size: 8,
      }
    );
  }
};


/* --------------------------------------------------------------------------
 * DRAW DECLARATION + BOX NUMBER
 * ------------------------------------------------------------------------ */

const drawDeclarationSection = (
  page,
  x,
  y,
  width,
  height,
  data,
  fonts
) => {

  const {
    font,
    fontBold,
  } = fonts;

  const {
    boxNumber,
    totalBoxes,
  } = data;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: BLACK,
    borderWidth: 0.8,
    color: WHITE,
  });

  /*
   * Left declaration section.
   */

  const rightSectionWidth = 110;

  const leftWidth =
    width - rightSectionWidth;

  drawVerticalLine(
    page,
    x + leftWidth,
    y,
    y + height,
    0.8
  );

  /*
   * Declaration heading.
   */

  page.drawText(
    'Sender Declaration – Residential Deliveries',
    {
      x: x + 4,
      y: y + height - 12,
      size: 6.4,
      font: fontBold,
      color: BLACK,
    }
  );

  /*
   * Underline heading.
   */

  drawHorizontalLine(
    page,
    x + 4,
    x + leftWidth - 4,
    y + height - 14,
    0.5
  );

  const declaration =
    'The sender acknowledges and authorises that residential deliveries may be left unattended at the delivery address, including at the doorstep or another location deemed safe by the driver, without obtaining a signature.';

  const declarationLines = wrapText(
    declaration,
    font,
    6.7,
    leftWidth - 14
  );

  let declarationY =
    y + height - 25;

  for (
    let i = 0;
    i < Math.min(
      declarationLines.length,
      7
    );
    i++
  ) {

    drawCenteredText(
      page,
      declarationLines[i],
      x + leftWidth / 2,
      declarationY,
      {
        font,
        size: 6.7,
        color: BLACK,
      }
    );

    declarationY -= 9;
  }

  /*
   * Right section.
   */

  const rightX =
    x + leftWidth;

  const rightWidth =
    rightSectionWidth;

  /*
   * Order / consignment number.
   */

  const barcodeText =
    data.barcodeText || '';

  if (barcodeText) {

    drawCenteredText(
      page,
      barcodeText,
      rightX + rightWidth / 2,
      y + height - 17,
      {
        font,
        size: 7,
        color: BLACK,
      }
    );
  }

  /*
   * BOX NUMBER
   *
   * Example:
   *
   * 1 of 12
   */

  const boxText =
    `${boxNumber} of ${totalBoxes}`;

  drawCenteredText(
    page,
    boxText,
    rightX + rightWidth / 2,
    y + 17,
    {
      font: fontBold,
      size: 22,
      color: BLACK,
    }
  );
};


/* --------------------------------------------------------------------------
 * DRAW BARCODE SECTION
 * ------------------------------------------------------------------------ */

const drawBarcodeSection = async (
  page,
  pdfDoc,
  x,
  y,
  width,
  height,
  barcodeText
) => {

  const barcodeBuffer =
    await generateBarcode(
      barcodeText
    );

  if (!barcodeBuffer) {
    return;
  }

  try {

    const barcodeImage =
      await pdfDoc.embedPng(
        barcodeBuffer
      );

    /*
     * Leave a small margin around barcode.
     */

    const paddingX = 8;

    /*
     * Barcode image contains the number itself
     * underneath because displayValue=true.
     */

    const barcodeWidth =
      width - paddingX * 2;

    const barcodeHeight =
      height - 8;

    page.drawImage(
      barcodeImage,
      {
        x: x + paddingX,
        y: y + 4,
        width: barcodeWidth,
        height: barcodeHeight,
      }
    );

  } catch (error) {

    console.error(
      'Error drawing barcode:',
      error
    );
  }
};


/* --------------------------------------------------------------------------
 * GENERATE THE 10 x 15 LABEL
 * ------------------------------------------------------------------------ */

const generate10x15Label = async (
  page,
  pdfDoc,
  data
) => {

  const width = LABEL_WIDTH;
  const height = LABEL_HEIGHT;

  /*
   * Fonts.
   */

  const font =
    await pdfDoc.embedFont(
      StandardFonts.Helvetica
    );

  const fontBold =
    await pdfDoc.embedFont(
      StandardFonts.HelveticaBold
    );

  const fonts = {
    font,
    fontBold,
  };

  /*
   * White background.
   */

  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: WHITE,
  });

  /*
   * OUTER BORDER
   */

  page.drawRectangle({
    x: 1.5,
    y: 1.5,
    width: width - 3,
    height: height - 3,
    borderColor: BLACK,
    borderWidth: 1.5,
    color: WHITE,
  });


  /*
   |--------------------------------------------------------------------------
   | INNER AREA
   |--------------------------------------------------------------------------
   */

  const margin = 9;

  const left =
    margin;

  const right =
    width - margin;

  const usableWidth =
    width - margin * 2;


  /*
   |--------------------------------------------------------------------------
   | SECTION HEIGHTS
   |--------------------------------------------------------------------------
   |
   | Top QR section       ~92 pt
   | Name                  39 pt
   | Address               74 pt
   | Instructions          55 pt
   | Declaration           61 pt
   | Barcode               remainder
   |
   |--------------------------------------------------------------------------
   */

  const topSectionHeight = 92;

  const nameSectionHeight = 39;

  const addressSectionHeight = 74;

  const instructionsSectionHeight = 55;

  const declarationSectionHeight = 62;

  /*
   * Barcode gets everything remaining.
   */

  const barcodeSectionHeight =
    height -
    margin * 2 -
    topSectionHeight -
    nameSectionHeight -
    addressSectionHeight -
    instructionsSectionHeight -
    declarationSectionHeight;


  /*
   |--------------------------------------------------------------------------
   | TOP QR SECTION
   |--------------------------------------------------------------------------
   */

  let currentTop =
    height - margin;

  const topSectionY =
    currentTop - topSectionHeight;

  await drawTopSection(
    page,
    pdfDoc,
    left,
    topSectionY,
    usableWidth,
    topSectionHeight,
    data.barcodeText,
    fonts
  );


  /*
   |--------------------------------------------------------------------------
   | CUSTOMER NAME
   |--------------------------------------------------------------------------
   */

  currentTop =
    topSectionY;

  const nameY =
    currentTop - nameSectionHeight;

  drawCustomerNameSection(
    page,
    left,
    nameY,
    usableWidth,
    nameSectionHeight,
    data.customerName,
    fonts
  );


  /*
   |--------------------------------------------------------------------------
   | ADDRESS / CONTACT
   |--------------------------------------------------------------------------
   */

  currentTop =
    nameY;

  const addressY =
    currentTop -
    addressSectionHeight;

  const logoImage =
    await loadLogo(pdfDoc);

  drawAddressSection(
    page,
    left,
    addressY,
    usableWidth,
    addressSectionHeight,
    data,
    fonts,
    logoImage
  );


  /*
   |--------------------------------------------------------------------------
   | INSTRUCTIONS
   |--------------------------------------------------------------------------
   */

  currentTop =
    addressY;

  const instructionsY =
    currentTop -
    instructionsSectionHeight;

  drawInstructionsSection(
    page,
    left,
    instructionsY,
    usableWidth,
    instructionsSectionHeight,
    data.instructions,
    fonts
  );


  /*
   |--------------------------------------------------------------------------
   | DECLARATION
   |--------------------------------------------------------------------------
   */

  currentTop =
    instructionsY;

  const declarationY =
    currentTop -
    declarationSectionHeight;

  drawDeclarationSection(
    page,
    left,
    declarationY,
    usableWidth,
    declarationSectionHeight,
    data,
    fonts
  );


  /*
   |--------------------------------------------------------------------------
   | BARCODE
   |--------------------------------------------------------------------------
   */

  const barcodeY =
    margin;

  await drawBarcodeSection(
    page,
    pdfDoc,
    left,
    barcodeY,
    usableWidth,
    barcodeSectionHeight,
    data.barcodeText
  );
};


/* --------------------------------------------------------------------------
 * GENERIC LABEL RENDERER
 *
 * Kept for the other existing layouts.
 * ------------------------------------------------------------------------ */

const generateLabelOnPage = async (
  page,
  x,
  y,
  width,
  height,
  data
) => {

  const {
    doNumber,
    barcodeText,
    customerName,
    address,
    companyName,
    boxNumber,
    totalBoxes,
    phone,
    instructions,
    config,
  } = data;

  /*
   * If this is the exact 10x15 layout,
   * use the new reference design.
   */

  if (
    Math.abs(width - LABEL_WIDTH) < 0.1 &&
    Math.abs(height - LABEL_HEIGHT) < 0.1
  ) {

    await generate10x15Label(
      page,
      page.doc,
      data
    );

    return;
  }


  /*
   * ------------------------------------------------------------------------
   * FALLBACK FOR OTHER EXISTING LABEL SIZES
   * ------------------------------------------------------------------------
   */

  const font =
    await page.doc.embedFont(
      StandardFonts.Helvetica
    );

  const fontBold =
    await page.doc.embedFont(
      StandardFonts.HelveticaBold
    );

  const scale =
    config.scale || 1;

  const padding =
    6 * scale;

  const left =
    x + padding;

  const right =
    x + width - padding;

  const top =
    y + height - padding;

  /*
   * White background.
   */

  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: WHITE,
  });

  /*
   * Border.
   */

  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: BLACK,
    borderWidth: 1,
    color: WHITE,
  });

  /*
   * Customer.
   */

  page.drawText(
    customerName || 'Customer',
    {
      x: left,
      y: top - 18 * scale,
      size: 12 * scale,
      font: fontBold,
      color: BLACK,
    }
  );

  /*
   * Address.
   */

  let textY =
    top - 34 * scale;

  if (address) {

    const addressLines =
      wrapText(
        String(address),
        font,
        8 * scale,
        width - padding * 2
      );

    for (
      let i = 0;
      i < Math.min(addressLines.length, 5);
      i++
    ) {

      page.drawText(
        addressLines[i],
        {
          x: left,
          y: textY,
          size: 8 * scale,
          font,
          color: BLACK,
        }
      );

      textY -=
        10 * scale;
    }
  }

  /*
   * Phone.
   */

  if (phone) {

    page.drawText(
      String(phone),
      {
        x: left,
        y: textY,
        size: 8 * scale,
        font,
        color: BLACK,
      }
    );

    textY -=
      12 * scale;
  }

  /*
   * Instructions.
   */

  if (
    instructions &&
    String(instructions).trim()
  ) {

    page.drawText(
      'INSTRUCTIONS',
      {
        x: left,
        y: textY,
        size: 7 * scale,
        font: fontBold,
        color: BLACK,
      }
    );

    textY -=
      11 * scale;

    const lines =
      wrapText(
        String(instructions),
        font,
        7 * scale,
        width - padding * 2
      );

    for (
      let i = 0;
      i < Math.min(lines.length, 4);
      i++
    ) {

      page.drawText(
        lines[i],
        {
          x: left,
          y: textY,
          size: 7 * scale,
          font,
          color: BLACK,
        }
      );

      textY -=
        9 * scale;
    }
  }

  /*
   * Barcode.
   */

  const barcodeBuffer =
    await generateBarcode(
      barcodeText
    );

  if (barcodeBuffer) {

    try {

      const barcodeImage =
        await page.doc.embedPng(
          barcodeBuffer
        );

      const barcodeWidth =
        Math.min(
          width - padding * 2,
          240 * scale
        );

      const barcodeHeight =
        Math.min(
          65 * scale,
          height * 0.25
        );

      page.drawImage(
        barcodeImage,
        {
          x: x + (width - barcodeWidth) / 2,
          y: y + padding,
          width: barcodeWidth,
          height: barcodeHeight,
        }
      );

    } catch (error) {

      console.error(
        'Error drawing fallback barcode:',
        error
      );
    }
  }

  /*
   * QR.
   */

  const qrBuffer =
    await generateQRCode(
      barcodeText
    );

  if (qrBuffer) {

    try {

      const qrImage =
        await page.doc.embedPng(
          qrBuffer
        );

      const qrSize =
        Math.min(
          55 * scale,
          width * 0.25,
          height * 0.18
        );

      page.drawImage(
        qrImage,
        {
          x: right - qrSize,
          y: top - qrSize,
          width: qrSize,
          height: qrSize,
        }
      );

    } catch (error) {

      console.error(
        'Error drawing fallback QR:',
        error
      );
    }
  }

  /*
   * Box number.
   */

  drawRightText(
    page,
    `${boxNumber} of ${totalBoxes}`,
    right,
    y + height * 0.40,
    {
      font: fontBold,
      size: 10 * scale,
      color: BLACK,
    }
  );

  /*
   * Order number.
   */

  drawRightText(
    page,
    String(doNumber || ''),
    right,
    y + height * 0.46,
    {
      font,
      size: 7 * scale,
      color: BLACK,
    }
  );
};


/* --------------------------------------------------------------------------
 * GENERATE SHIPPING LABELS
 * ------------------------------------------------------------------------ */

const generateShippingLabels = async (
  doNumber,
  barcodes,
  customerName,
  address,
  companyName = '',
  phone = '',
  instructions = '',
  layout = '10x15'
) => {

  const pdfDoc =
    await PDFDocument.create();

  /*
   * Make sure barcodes is always an array.
   */

  const barcodeList =
    Array.isArray(barcodes)
      ? barcodes
      : [barcodes];


  /*
   * Remove empty barcode values.
   */

  const validBarcodes =
    barcodeList.filter(
      (value) =>
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ''
    );


  /*
   * Prevent empty PDF generation.
   */

  if (validBarcodes.length === 0) {

    throw new Error(
      'At least one barcode is required to generate a shipping label.'
    );
  }


  /*
   * Get selected layout.
   */

  const config =
    layouts[layout] ||
    layouts['10x15'];


  const {
    labelsPerPage,
    cols,
    marginX,
    marginY,
    gapX,
    gapY,
    labelWidth,
    labelHeight,
    pageWidth,
    pageHeight,
    isA4Layout,
  } = config;


  /*
   |--------------------------------------------------------------------------
   | INDIVIDUAL LABEL PAGE
   |--------------------------------------------------------------------------
   |
   | 10x15 is always one label per page.
   |
   */

  if (!isA4Layout) {

    for (
      let i = 0;
      i < validBarcodes.length;
      i++
    ) {

      const page =
        pdfDoc.addPage([
          pageWidth,
          pageHeight,
        ]);


      const labelData = {

        doNumber,

        barcodeText:
          String(validBarcodes[i]),

        customerName,

        address,

        companyName,

        boxNumber:
          i + 1,

        totalBoxes:
          validBarcodes.length,

        phone,

        instructions,

        config,

      };


      await generateLabelOnPage(
        page,
        0,
        0,
        pageWidth,
        pageHeight,
        labelData
      );
    }


    return pdfDoc;
  }


  /*
   |--------------------------------------------------------------------------
   | A4 MULTI-LABEL LAYOUT
   |--------------------------------------------------------------------------
   */

  for (
    let i = 0;
    i < validBarcodes.length;
    i++
  ) {

    const positionInPage =
      i % labelsPerPage;

    const col =
      positionInPage % cols;

    const row =
      Math.floor(
        positionInPage / cols
      );


    /*
     * Create a new A4 page.
     */

    if (
      i % labelsPerPage === 0
    ) {

      pdfDoc.addPage([
        pageWidth,
        pageHeight,
      ]);
    }


    const page =
      pdfDoc.getPages()[
        pdfDoc.getPages().length - 1
      ];


    const x =
      marginX +
      col *
        (labelWidth + gapX);


    const y =
      pageHeight -
      marginY -
      (row + 1) *
        labelHeight -
      row *
        gapY;


    const labelData = {

      doNumber,

      barcodeText:
        String(validBarcodes[i]),

      customerName,

      address,

      companyName,

      boxNumber:
        i + 1,

      totalBoxes:
        validBarcodes.length,

      phone,

      instructions,

      config,

    };


    await generateLabelOnPage(
      page,
      x,
      y,
      labelWidth,
      labelHeight,
      labelData
    );
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