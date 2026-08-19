// src/services/podService.js

const {
  PDFDocument,
  rgb,
  StandardFonts,
} = require('pdf-lib');

const axios = require('axios');
const path = require('path');
const fs = require('fs');

class PODService {
  static async generatePOD(
    jobData = {},
    photos = []
  ) {
    try {
      console.log('📄 Generating POD PDF...');

      const pdfDoc =
        await PDFDocument.create();

      const page =
        pdfDoc.addPage([
          595.28,
          841.89,
        ]);

      const {
        width,
        height,
      } = page.getSize();

      const regular =
        await pdfDoc.embedFont(
          StandardFonts.Helvetica
        );

      const bold =
        await pdfDoc.embedFont(
          StandardFonts.HelveticaBold
        );

      // ============================================================
      // COLORS
      // ============================================================

      const BLACK = rgb(
        0,
        0,
        0
      );

      const WHITE = rgb(
        1,
        1,
        1
      );

      const GREY = rgb(
        0.35,
        0.35,
        0.35
      );

      const BORDER = rgb(
        0.1,
        0.1,
        0.1
      );

      // ============================================================
      // PAGE / LAYOUT
      // ============================================================

      const M = 16;

      const W =
        width - M * 2;

      const HALF =
        W / 2;

      // ============================================================
      // BASIC HELPERS
      // ============================================================

      const safe = (
        value,
        fallback = ''
      ) => {
        if (
          value === null ||
          value === undefined
        ) {
          return fallback;
        }

        return String(value);
      };

      const first = (
        ...values
      ) => {
        for (
          const value of values
        ) {
          if (
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ''
          ) {
            return value;
          }
        }

        return '';
      };

      // ============================================================
      // DATE
      // ============================================================

      const formatDate = (
        value
      ) => {
        if (!value) {
          return 'N/A';
        }

        if (
          value instanceof Date
        ) {
          return value.toLocaleDateString(
            'en-GB'
          );
        }

        const text =
          String(value);

        const match =
          text.match(
            /^(\d{4})-(\d{2})-(\d{2})/
          );

        if (match) {
          return `${match[3]}/${match[2]}/${match[1]}`;
        }

        return text;
      };

      // ============================================================
      // TIME
      // ============================================================

      const formatTime = (
        value
      ) => {
        if (!value) {
          return 'N/A';
        }

        const text =
          String(value);

        if (
          /[AP]M/i.test(text)
        ) {
          return text;
        }

        const match =
          text.match(
            /(\d{1,2}):(\d{2})(?::\d{2})?/
          );

        if (!match) {
          return text;
        }

        let hours =
          Number(match[1]);

        const minutes =
          match[2];

        const suffix =
          hours >= 12
            ? 'PM'
            : 'AM';

        hours =
          hours % 12 || 12;

        return `${String(
          hours
        ).padStart(
          2,
          '0'
        )}.${minutes} ${suffix}`;
      };

      // ============================================================
      // DATA
      // ============================================================

      const companyName =
        first(
          jobData.company_name,
          'Meal Cart'
        );

      const doNumber =
        first(
          jobData.do_number,
          jobData.order_number,
          'N/A'
        );

      const recipient =
        first(
          jobData.deliver_to_collect_from,
          jobData.deliver_to,
          jobData.recipient_name,
          'N/A'
        );

      const address =
        first(
          jobData.address,
          [
            jobData.address_1,
            jobData.address_2,
            jobData.city,
            jobData.state,
            jobData.postal_code,
            jobData.country,
          ]
            .filter(Boolean)
            .join(' '),
          'N/A'
        );

      const scheduledDate =
        formatDate(
          first(
            jobData.date,
            jobData.scheduled_date
          )
        );

      const phone =
        first(
          jobData.phone,
          jobData.phone_number,
          jobData.driver_mobile_number,
          'N/A'
        );

      const email =
        first(
          jobData.notify_email,
          jobData.email,
          'N/A'
        );

      const group =
        first(
          jobData.group_name,
          jobData.group,
          'N/A'
        );

      const instructions =
        first(
          jobData.instructions,
          ''
        );

      const deliveredDate =
        formatDate(
          first(
            jobData.pod_at,
            jobData.delivered_date,
            jobData.delivery_date
          )
        );

      const deliveredTime =
        formatTime(
          first(
            jobData.pod_time,
            jobData.delivered_time,
            jobData.time_delivered
          )
        );

      const vehicle =
        first(
          jobData.assign_to,
          jobData.assigned_vehicle,
          jobData.vehicle,
          'N/A'
        );

      const status =
        first(
          jobData.status,
          jobData.primary_job_status,
          'N/A'
        )
          .replace(
            /_/g,
            ' '
          );

      const podAddress =
        first(
          jobData.pod_address,
          jobData.address,
          address,
          'N/A'
        );

      const lat =
        first(
          jobData.pod_lat,
          jobData.address_lat,
          jobData.latitude,
          'N/A'
        );

      const lng =
        first(
          jobData.pod_lng,
          jobData.address_lng,
          jobData.longitude,
          'N/A'
        );

      const driverNotes =
        first(
          jobData.remarks,
          jobData.note,
          jobData.driver_notes,
          ''
        );

      // ============================================================
      // DRAW RECTANGLE
      // ============================================================

      const rect = (
        x,
        top,
        w,
        h
      ) => {
        page.drawRectangle({
          x,
          y:
            height -
            top -
            h,
          width: w,
          height: h,
          borderColor:
            BORDER,
          borderWidth: 0.8,
          color:
            WHITE,
        });
      };

      // ============================================================
      // DRAW LINE
      // ============================================================

      const line = (
        x1,
        top1,
        x2,
        top2,
        thickness = 0.8
      ) => {
        page.drawLine({
          start: {
            x: x1,
            y:
              height -
              top1,
          },

          end: {
            x: x2,
            y:
              height -
              top2,
          },

          thickness,
          color:
            BORDER,
        });
      };

      // ============================================================
      // DRAW TEXT
      // ============================================================

      const drawText = (
        value,
        x,
        top,
        size = 10,
        font = regular
      ) => {
        if (
          value === null ||
          value === undefined
        ) {
          return;
        }

        const valueText =
          String(value);

        if (!valueText) {
          return;
        }

        page.drawText(
          valueText,
          {
            x,

            y:
              height -
              top -
              size,

            size,
            font,
            color:
              BLACK,
          }
        );
      };

      // ============================================================
      // CENTER TEXT
      // ============================================================

      const centerText = (
        value,
        x,
        top,
        w,
        size,
        font = regular
      ) => {
        if (!value) {
          return;
        }

        const valueText =
          String(value);

        const textWidth =
          font.widthOfTextAtSize(
            valueText,
            size
          );

        drawText(
          valueText,
          x +
            Math.max(
              0,
              (w -
                textWidth) /
                2
            ),
          top,
          size,
          font
        );
      };

      // ============================================================
      // WRAP TEXT
      // ============================================================

      const wrapText = (
        value,
        maxWidth,
        size,
        font = regular
      ) => {
        if (!value) {
          return [];
        }

        const words =
          String(value)
            .replace(
              /\s+/g,
              ' '
            )
            .trim()
            .split(' ');

        const lines = [];

        let current =
          '';

        for (
          const word of words
        ) {
          const test =
            current
              ? `${current} ${word}`
              : word;

          const textWidth =
            font.widthOfTextAtSize(
              test,
              size
            );

          if (
            textWidth <=
            maxWidth
          ) {
            current =
              test;
          } else {
            if (current) {
              lines.push(
                current
              );
            }

            current =
              word;
          }
        }

        if (current) {
          lines.push(
            current
          );
        }

        return lines;
      };

      // ============================================================
      // DRAW WRAPPED TEXT
      // ============================================================

      const drawWrapped = (
        value,
        x,
        top,
        maxWidth,
        size = 10,
        font = regular,
        gap = 2,
        maxLines = Infinity
      ) => {
        const lines =
          wrapText(
            value,
            maxWidth,
            size,
            font
          ).slice(
            0,
            maxLines
          );

        lines.forEach(
          (
            currentLine,
            index
          ) => {
            drawText(
              currentLine,
              x,
              top +
                index *
                  (size + gap),
              size,
              font
            );
          }
        );

        return lines.length;
      };

      // ============================================================
      // LABEL + VALUE
      // ============================================================

      const drawLabelValue = (
        label,
        value,
        x,
        top,
        maxWidth,
        size = 10
      ) => {
        const labelText =
          `${label} :`;

        const labelWidth =
          bold.widthOfTextAtSize(
            labelText,
            size
          );

        drawText(
          labelText,
          x,
          top,
          size,
          bold
        );

        const availableWidth =
          maxWidth -
          labelWidth -
          4;

        const lines =
          wrapText(
            safe(
              value,
              'N/A'
            ),
            availableWidth,
            size,
            regular
          );

        lines
          .slice(0, 2)
          .forEach(
            (
              currentLine,
              index
            ) => {
              drawText(
                currentLine,
                x +
                  labelWidth +
                  4,
                top +
                  index *
                    (size + 1),
                size,
                regular
              );
            }
          );
      };

      // ============================================================
      // LOAD LOGO
      //
      // SAME METHOD AS YOUR SHIPPING LABEL SCRIPT
      // ============================================================

      let logoImage = null;

      try {
        const logoPath =
          path.join(
            __dirname,
            '../../logo.png'
          );

        console.log(
          '🖼️ Loading POD logo:',
          logoPath
        );

        if (
          fs.existsSync(
            logoPath
          )
        ) {
          const logoBuffer =
            fs.readFileSync(
              logoPath
            );

          logoImage =
            await pdfDoc.embedPng(
              logoBuffer
            );

          console.log(
            '✅ POD logo loaded successfully'
          );
        } else {
          console.warn(
            '⚠️ POD logo not found:',
            logoPath
          );
        }
      } catch (logoError) {
        console.error(
          '❌ Error loading POD logo:',
          logoError.message
        );
      }

      // ============================================================
      // HEADER
      // ============================================================

      centerText(
        'PROOF OF DELIVERY',
        M,
        22,
        W,
        15,
        bold
      );

      const headerTop =
        51;

      const headerH =
        87;

      const logoW =
        140;

      // Main header.
      rect(
        M,
        headerTop,
        W,
        headerH
      );

      // Logo divider.
      line(
        M + logoW,
        headerTop,
        M + logoW,
        headerTop +
          headerH
      );

      // ============================================================
      // LOGO
      // ============================================================

      if (logoImage) {
        try {
          const logoAreaX =
            M;

          const logoAreaY =
            headerTop;

          const logoAreaWidth =
            logoW;

          const logoAreaHeight =
            headerH;

          const padding =
            12;

          const maxLogoWidth =
            logoAreaWidth -
            padding * 2;

          const maxLogoHeight =
            logoAreaHeight -
            padding * 2;

          const imageRatio =
            logoImage.width /
            logoImage.height;

          let drawWidth =
            maxLogoWidth;

          let drawHeight =
            drawWidth /
            imageRatio;

          // Keep the logo inside the box.
          if (
            drawHeight >
            maxLogoHeight
          ) {
            drawHeight =
              maxLogoHeight;

            drawWidth =
              drawHeight *
              imageRatio;
          }

          const logoX =
            logoAreaX +
            (
              logoAreaWidth -
              drawWidth
            ) /
              2;

          const logoY =
            height -
            logoAreaY -
            (
              logoAreaHeight +
              drawHeight
            ) /
              2;

          page.drawImage(
            logoImage,
            {
              x: logoX,
              y: logoY,
              width:
                drawWidth,
              height:
                drawHeight,
            }
          );

          console.log(
            '✅ Logo drawn on POD'
          );
        } catch (
          logoDrawError
        ) {
          console.error(
            '❌ Error drawing POD logo:',
            logoDrawError.message
          );
        }
      } else {
        // Fallback only if logo.png is unavailable.
        centerText(
          companyName,
          M,
          headerTop + 34,
          logoW,
          15,
          bold
        );
      }

      // ============================================================
      // HEADER RIGHT SIDE
      // ============================================================

      const rightX =
        M + logoW;

      const rightW =
        W - logoW;

      // DO number.
      centerText(
        doNumber,
        rightX,
        headerTop + 7,
        rightW,
        17,
        regular
      );

      line(
        rightX,
        headerTop + 31,
        M + W,
        headerTop + 31
      );

      // Recipient.
      centerText(
        recipient,
        rightX,
        headerTop + 38,
        rightW,
        13,
        bold
      );

      line(
        rightX,
        headerTop + 58,
        M + W,
        headerTop + 58
      );

      // Address.
      centerText(
        address,
        rightX + 7,
        headerTop + 64,
        rightW - 14,
        10.5,
        bold
      );

      // ============================================================
      // CONTACT / INSTRUCTIONS
      // ============================================================

      const infoTop =
        142;

      const infoH =
        72;

      const leftW =
        282;

      const rightInfoX =
        M + leftW;

      rect(
        M,
        infoTop,
        W,
        infoH
      );

      // Main divider.
      line(
        rightInfoX,
        infoTop,
        rightInfoX,
        infoTop + infoH
      );

      // Left rows.
      line(
        M,
        infoTop + 24,
        rightInfoX,
        infoTop + 24
      );

      line(
        M,
        infoTop + 48,
        rightInfoX,
        infoTop + 48
      );

      drawLabelValue(
        'SCHEDULED DATE',
        scheduledDate,
        M + 5,
        infoTop + 7,
        leftW - 10,
        10
      );

      drawLabelValue(
        'PHONE NO.',
        phone,
        M + 5,
        infoTop + 31,
        leftW - 10,
        10
      );

      drawLabelValue(
        'EMAIL',
        email,
        M + 5,
        infoTop + 55,
        leftW - 10,
        10
      );

      // Right rows.
      line(
        rightInfoX,
        infoTop + 24,
        M + W,
        infoTop + 24
      );

      drawLabelValue(
        'GROUP',
        group,
        rightInfoX + 5,
        infoTop + 7,
        W -
          leftW -
          10,
        10
      );

      drawText(
        'INSTRUCTIONS :',
        rightInfoX + 5,
        infoTop + 31,
        10,
        bold
      );

      drawWrapped(
        instructions ||
          'N/A',
        rightInfoX + 83,
        infoTop + 31,
        W -
          leftW -
          94,
        9.3,
        regular,
        2,
        2
      );

      // ============================================================
      // DELIVERY STATUS
      // ============================================================

      const deliveryTop =
        217;

      const deliveryH =
        48;

      const deliveryLeftW =
        282;

      const deliveryRightX =
        M +
        deliveryLeftW;

      rect(
        M,
        deliveryTop,
        W,
        deliveryH
      );

      line(
        deliveryRightX,
        deliveryTop,
        deliveryRightX,
        deliveryTop +
          deliveryH
      );

      line(
        M,
        deliveryTop + 24,
        M + W,
        deliveryTop + 24
      );

      drawLabelValue(
        'DELIVERED DATE',
        deliveredDate,
        M + 5,
        deliveryTop + 7,
        deliveryLeftW - 10,
        10
      );

      drawLabelValue(
        'DELIVERED TIME',
        deliveredTime,
        deliveryRightX + 5,
        deliveryTop + 7,
        W -
          deliveryLeftW -
          10,
        10
      );

      drawLabelValue(
        'VEHICLE',
        vehicle,
        M + 5,
        deliveryTop + 31,
        deliveryLeftW - 10,
        10
      );

      drawLabelValue(
        'DELIVERY STATUS',
        status,
        deliveryRightX + 5,
        deliveryTop + 31,
        W -
          deliveryLeftW -
          10,
        10
      );

      // ============================================================
      // LOCATION
      // ============================================================

      const locationTop =
        268;

      const locationH =
        105;

      rect(
        M,
        locationTop,
        W,
        locationH
      );

      centerText(
        'LAST KNOWN APPROXIMATE LOCATION (50M RADIUS ACCURACY) AT TIME OF SUBMISSION',
        M + 5,
        locationTop + 8,
        W - 10,
        9.5,
        bold
      );

      centerText(
        podAddress,
        M + 10,
        locationTop + 28,
        W - 20,
        10.5,
        regular
      );

      // Coordinate separator.
      line(
        M,
        locationTop + 48,
        M + W,
        locationTop + 48
      );

      line(
        M + HALF,
        locationTop + 48,
        M + HALF,
        locationTop + 73
      );

      drawLabelValue(
        'LATITUDE',
        lat,
        M + 6,
        locationTop + 55,
        HALF - 12,
        9.8
      );

      drawLabelValue(
        'LONGITUDE',
        lng,
        M + HALF + 6,
        locationTop + 55,
        HALF - 12,
        9.8
      );

      // Driver notes separator.
      line(
        M,
        locationTop + 73,
        M + W,
        locationTop + 73
      );

      centerText(
        'DRIVER NOTES',
        M + 5,
        locationTop + 77,
        W - 10,
        10,
        bold
      );

      centerText(
        driverNotes ||
          'N/A',
        M + 12,
        locationTop + 91,
        W - 24,
        9.5,
        regular
      );

      // ============================================================
      // ITEMS TABLE
      // ============================================================

      const itemsTop =
        378;

      const itemsH =
        105;

      const items =
        Array.isArray(
          jobData.items
        )
          ? jobData.items
          : [];

      rect(
        M,
        itemsTop,
        W,
        itemsH
      );

      const tableHeaderH =
        31;

      line(
        M,
        itemsTop +
          tableHeaderH,
        M + W,
        itemsTop +
          tableHeaderH
      );

      const tableWidths = [
        48,
        94,
        133,
        34,
        43,
        80,
        109,
      ];

      let tableX =
        M;

      for (
        let i = 0;
        i <
        tableWidths.length -
          1;
        i++
      ) {
        tableX +=
          tableWidths[i];

        line(
          tableX,
          itemsTop,
          tableX,
          itemsTop +
            itemsH
        );
      }

      const headers = [
        'NO.',
        'SKU',
        'DESCRIPTION',
        'QTY',
        'UOM',
        'REJECT',
        'REASON',
      ];

      tableX =
        M;

      headers.forEach(
        (
          header,
          index
        ) => {
          centerText(
            header,
            tableX,
            itemsTop + 10,
            tableWidths[index],
            8.8,
            bold
          );

          tableX +=
            tableWidths[index];
        }
      );

      // Four visible rows.
      const bodyTop =
        itemsTop +
        tableHeaderH;

      const rowH =
        (
          itemsH -
          tableHeaderH
        ) /
        4;

      for (
        let row = 0;
        row <
        Math.min(
          items.length,
          4
        );
        row++
      ) {
        const rowTop =
          bodyTop +
          row * rowH;

        if (row > 0) {
          line(
            M,
            rowTop,
            M + W,
            rowTop
          );
        }

        const item =
          items[row] || {};

        const rowData = [
          String(
            row + 1
          ),

          first(
            item.sku,
            ''
          ),

          first(
            item.desc,
            item.description,
            ''
          ),

          first(
            item.qty,
            ''
          ),

          first(
            item.uom,
            'EA'
          ),

          first(
            item.reject,
            item.rejected,
            ''
          ),

          first(
            item.reason,
            ''
          ),
        ];

        tableX =
          M;

        rowData.forEach(
          (
            value,
            index
          ) => {
            centerText(
              safe(value),
              tableX + 2,
              rowTop + 8,
              tableWidths[index] -
                4,
              8,
              regular
            );

            tableX +=
              tableWidths[index];
          }
        );
      }

      // ============================================================
      // SIGNATURE / PHOTOS
      // ============================================================

      const photosTop =
        490;

      const photosH =
        166;

      rect(
        M,
        photosTop,
        W,
        photosH
      );

      centerText(
        'SIGNATURE / PHOTOS',
        M,
        photosTop + 10,
        W,
        10.5,
        bold
      );

      line(
        M,
        photosTop + 32,
        M + W,
        photosTop + 32
      );

      const photoAreaTop =
        photosTop + 38;

      const photoAreaH =
        photosH - 44;

      let photoX =
        M + 7;

      let photoY =
        photoAreaTop;

      const photoGap =
        5;

      const photoW =
        105;

      const photoH =
        120;

      // ============================================================
      // PHOTOS
      // ============================================================

      for (
        let i = 0;
        i <
        Math.min(
          photos.length,
          4
        );
        i++
      ) {
        try {
          console.log(
            `📸 Embedding POD photo ${
              i + 1
            }`
          );

          const imageBuffer =
            await PODService.fetchImage(
              photos[i]
            );

          const image =
            await PODService.embedImage(
              pdfDoc,
              imageBuffer
            );

          if (!image) {
            continue;
          }

          const aspectRatio =
            image.width /
            image.height;

          let drawWidth =
            photoW;

          let drawHeight =
            drawWidth /
            aspectRatio;

          if (
            drawHeight >
            photoH
          ) {
            drawHeight =
              photoH;

            drawWidth =
              drawHeight *
              aspectRatio;
          }

          // New row if needed.
          if (
            photoX +
              drawWidth >
            M + W - 5
          ) {
            photoX =
              M + 7;

            photoY +=
              photoH +
              photoGap;
          }

          if (
            photoY +
              drawHeight >
            photosTop +
              photosH -
              5
          ) {
            break;
          }

          page.drawImage(
            image,
            {
              x: photoX,

              y:
                height -
                photoY -
                drawHeight,

              width:
                drawWidth,

              height:
                drawHeight,
            }
          );

          photoX +=
            photoW +
            photoGap;

        } catch (
          photoError
        ) {
          console.error(
            `❌ Failed to embed POD photo ${
              i + 1
            }:`,
            photoError.message
          );
        }
      }

      // ============================================================
      // TERMS & CONDITIONS
      // ============================================================

      const termsTop =
        663;

      const termsH =
        86;

      rect(
        M,
        termsTop,
        W,
        termsH
      );

      centerText(
        'TERMS & CONDITIONS',
        M,
        termsTop + 9,
        W,
        10,
        bold
      );

      const termsText =
        first(
          jobData.terms_and_conditions,

          `Upon signing, I acknowledge that I have received the order in acceptable condition with the desired temperature. I understand that the mealcart does not accept any claims or disputes regarding the condition of the items after signing. This signifies my agreement that the order meets my satisfaction upon receipt, and I waive any right to dispute the condition thereafter. MealCart Refrigerated Couriers Pty Limited is not a common carrier. Insurance is not included unless otherwise stated.`
        );

      drawWrapped(
        termsText,
        M + 6,
        termsTop + 30,
        W - 12,
        7.7,
        bold,
        1.7,
        7
      );

      // ============================================================
      // OPTIONAL FOOTER
      // ============================================================

      if (
        jobData.show_generated_footer
      ) {
        const generated =
          new Date().toLocaleString();

        drawText(
          `Generated: ${generated}`,
          M,
          824,
          7,
          regular
        );

        drawText(
          `D.O. #: ${doNumber}`,
          width -
            M -
            100,
          824,
          7,
          regular
        );
      }

      console.log(
        '✅ POD PDF generated successfully'
      );

      return pdfDoc;

    } catch (error) {
      console.error(
        '❌ PDF generation error:',
        error
      );

      throw error;
    }
  }

  // ================================================================
  // FETCH IMAGE
  // ================================================================

  static async fetchImage(
    source
  ) {
    if (!source) {
      throw new Error(
        'Image source is empty'
      );
    }

    if (
      Buffer.isBuffer(source)
    ) {
      return source;
    }

    if (
      source instanceof
      Uint8Array
    ) {
      return source;
    }

    const response =
      await axios.get(
        source,
        {
          responseType:
            'arraybuffer',

          timeout:
            15000,

          headers: {
            'User-Agent':
              'Mozilla/5.0',
          },
        }
      );

    return Buffer.from(
      response.data
    );
  }

  // ================================================================
  // EMBED IMAGE
  // ================================================================

  static async embedImage(
    pdfDoc,
    bytes,
    declaredType = ''
  ) {
    if (!bytes) {
      return null;
    }

    const type =
      String(
        declaredType || ''
      ).toLowerCase();

    // Explicit PNG.
    if (
      type.includes('png')
    ) {
      try {
        return await pdfDoc.embedPng(
          bytes
        );
      } catch (_) {}
    }

    // Explicit JPG/JPEG.
    if (
      type.includes('jpg') ||
      type.includes('jpeg')
    ) {
      try {
        return await pdfDoc.embedJpg(
          bytes
        );
      } catch (_) {}
    }

    const buffer =
      Buffer.from(bytes);

    // ============================================================
    // PNG SIGNATURE
    // ============================================================

    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return await pdfDoc.embedPng(
        buffer
      );
    }

    // ============================================================
    // JPEG SIGNATURE
    // ============================================================

    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return await pdfDoc.embedJpg(
        buffer
      );
    }

    // ============================================================
    // FALLBACK
    // ============================================================

    try {
      return await pdfDoc.embedPng(
        buffer
      );
    } catch (_) {
      return await pdfDoc.embedJpg(
        buffer
      );
    }
  }
}

module.exports = PODService;