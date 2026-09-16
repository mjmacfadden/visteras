/**
 * Self-contained Web Worker script for animated GIF encoding.
 * Supports exact color palette extraction for pixel art, crisp alpha transparency,
 * and NeuQuant quantization fallback for truecolor images.
 */
export const GIF_WORKER_CODE = `
(function() {
  var EOF = -1;
  var BITS = 12;
  var HSIZE = 5003;
  var masks = [0x0000, 0x0001, 0x0003, 0x0007, 0x000F, 0x001F,
               0x003F, 0x007F, 0x00FF, 0x01FF, 0x03FF, 0x07FF,
               0x0FFF, 0x1FFF, 0x3FFF, 0x7FFF, 0xFFFF];

  function ByteArray() {
    this.page = -1;
    this.pages = [];
    this.newPage();
  }
  ByteArray.pageSize = 4096;
  ByteArray.prototype.newPage = function() {
    this.pages[++this.page] = new Uint8Array(ByteArray.pageSize);
    this.cursor = 0;
  };
  ByteArray.prototype.writeByte = function(val) {
    if (this.cursor >= ByteArray.pageSize) this.newPage();
    this.pages[this.page][this.cursor++] = val;
  };
  ByteArray.prototype.writeUTFBytes = function(string) {
    for (var l = string.length, i = 0; i < l; i++) {
      this.writeByte(string.charCodeAt(i));
    }
  };
  ByteArray.prototype.writeBytes = function(array, offset, length) {
    for (var l = length || array.length, i = offset || 0; i < l; i++) {
      this.writeByte(array[i]);
    }
  };

  function LZWEncoder(width, height, pixels, colorDepth) {
    var initCodeSize = Math.max(2, colorDepth);
    var accum = new Uint8Array(256);
    var htab = new Int32Array(HSIZE);
    var codetab = new Int32Array(HSIZE);
    var cur_accum = 0, cur_bits = 0;
    var a_count = 0;
    var free_ent = 0;
    var maxcode;
    var clear_flg = false;
    var g_init_bits, ClearCode, EOFCode;
    var n_bits, remaining, curPixel;

    function char_out(c, outs) {
      accum[a_count++] = c;
      if (a_count >= 254) flush_char(outs);
    }

    function cl_block(outs) {
      cl_hash(HSIZE);
      free_ent = ClearCode + 2;
      clear_flg = true;
      output(ClearCode, outs);
    }

    function cl_hash(hsize) {
      for (var i = 0; i < hsize; ++i) htab[i] = -1;
    }

    function compress(init_bits, outs) {
      var fcode, c, i, ent, disp, hsize_reg, hshift;
      g_init_bits = init_bits;
      clear_flg = false;
      n_bits = g_init_bits;
      maxcode = MAXCODE(n_bits);

      ClearCode = 1 << (init_bits - 1);
      EOFCode = ClearCode + 1;
      free_ent = ClearCode + 2;
      a_count = 0;
      ent = nextPixel();

      hshift = 0;
      for (fcode = HSIZE; fcode < 65536; fcode *= 2) ++hshift;
      hshift = 8 - hshift;
      hsize_reg = HSIZE;
      cl_hash(hsize_reg);

      output(ClearCode, outs);

      outer_loop: while ((c = nextPixel()) != EOF) {
        fcode = (c << BITS) + ent;
        i = (c << hshift) ^ ent;
        if (htab[i] === fcode) {
          ent = codetab[i];
          continue;
        } else if (htab[i] >= 0) {
          disp = hsize_reg - i;
          if (i === 0) disp = 1;
          do {
            if ((i -= disp) < 0) i += hsize_reg;
            if (htab[i] === fcode) {
              ent = codetab[i];
              continue outer_loop;
            }
          } while (htab[i] >= 0);
        }
        output(ent, outs);
        ent = c;
        if (free_ent < 1 << BITS) {
          codetab[i] = free_ent++;
          htab[i] = fcode;
        } else {
          cl_block(outs);
        }
      }

      output(ent, outs);
      output(EOFCode, outs);
    }

    function encode(outs) {
      outs.writeByte(initCodeSize);
      remaining = width * height;
      curPixel = 0;
      compress(initCodeSize + 1, outs);
      outs.writeByte(0);
    }

    function flush_char(outs) {
      if (a_count > 0) {
        outs.writeByte(a_count);
        outs.writeBytes(accum, 0, a_count);
        a_count = 0;
      }
    }

    function MAXCODE(nb) {
      return (1 << nb) - 1;
    }

    function nextPixel() {
      if (remaining === 0) return EOF;
      --remaining;
      var pix = pixels[curPixel++];
      return pix & 0xff;
    }

    function output(code, outs) {
      cur_accum &= masks[cur_bits];
      if (cur_bits > 0) cur_accum |= (code << cur_bits);
      else cur_accum = code;
      cur_bits += n_bits;

      while (cur_bits >= 8) {
        char_out((cur_accum & 0xff), outs);
        cur_accum >>= 8;
        cur_bits -= 8;
      }

      if (free_ent > maxcode || clear_flg) {
        if (clear_flg) {
          maxcode = MAXCODE(n_bits = g_init_bits);
          clear_flg = false;
        } else {
          ++n_bits;
          if (n_bits == BITS) maxcode = 1 << BITS;
          else maxcode = MAXCODE(n_bits);
        }
      }

      if (code == EOFCode) {
        while (cur_bits > 0) {
          char_out((cur_accum & 0xff), outs);
          cur_accum >>= 8;
          cur_bits -= 8;
        }
        flush_char(outs);
      }
    }

    this.encode = encode;
  }

  function NeuQuant(pixels, samplefac) {
    var netsize = 256;
    var netbiasshift = 4;
    var intbiasshift = 16;
    var intbias = (1 << intbiasshift);
    var gammashift = 10;
    var betashift = 10;
    var beta = (intbias >> betashift);
    var betagamma = (intbias << (gammashift - betashift));
    var initrad = (netsize >> 3);
    var radiusbiasshift = 6;
    var radiusbias = (1 << radiusbiasshift);
    var initradius = (initrad * radiusbias);
    var radiusdec = 30;
    var alphabiasshift = 10;
    var initalpha = (1 << alphabiasshift);
    var radbiasshift = 8;
    var radbias = (1 << radbiasshift);
    var alpharadbshift = (alphabiasshift + radbiasshift);
    var alpharadbias = (1 << alpharadbshift);
    var prime1 = 499, prime2 = 491, prime3 = 487, prime4 = 503;
    var minpicturebytes = (3 * prime4);

    var network, netindex, bias, freq, radpower;

    function init() {
      network = [];
      netindex = new Int32Array(256);
      bias = new Int32Array(netsize);
      freq = new Int32Array(netsize);
      radpower = new Int32Array(netsize >> 3);
      for (var i = 0; i < netsize; i++) {
        var v = (i << (netbiasshift + 8)) / netsize;
        network[i] = new Float64Array([v, v, v, 0]);
        freq[i] = intbias / netsize;
        bias[i] = 0;
      }
    }

    function unbiasnet() {
      for (var i = 0; i < netsize; i++) {
        network[i][0] >>= netbiasshift;
        network[i][1] >>= netbiasshift;
        network[i][2] >>= netbiasshift;
        network[i][3] = i;
      }
    }

    function altersingle(alpha, i, b, g, r) {
      network[i][0] -= (alpha * (network[i][0] - b)) / initalpha;
      network[i][1] -= (alpha * (network[i][1] - g)) / initalpha;
      network[i][2] -= (alpha * (network[i][2] - r)) / initalpha;
    }

    function alterneigh(radius, rad, b, g, r) {
      var lo = Math.abs(rad - radius);
      var hi = Math.min(rad + radius, netsize);
      var j = rad + 1, k = rad - 1, m = 1;
      while ((j < hi) || (k > lo)) {
        var a = radpower[m++];
        if (j < hi) {
          var p = network[j++];
          p[0] -= (a * (p[0] - b)) / alpharadbias;
          p[1] -= (a * (p[1] - g)) / alpharadbias;
          p[2] -= (a * (p[2] - r)) / alpharadbias;
        }
        if (k > lo) {
          var p = network[k--];
          p[0] -= (a * (p[0] - b)) / alpharadbias;
          p[1] -= (a * (p[1] - g)) / alpharadbias;
          p[2] -= (a * (p[2] - r)) / alpharadbias;
        }
      }
    }

    function contest(b, g, r) {
      var bestd = ~(1 << 31), bestbiasd = bestd, bestpos = -1, bestbiaspos = bestpos;
      for (var i = 0; i < netsize; i++) {
        var n = network[i];
        var dist = Math.abs((n[0] | 0) - b) + Math.abs((n[1] | 0) - g) + Math.abs((n[2] | 0) - r);
        if (dist < bestd) { bestd = dist; bestpos = i; }
        var biasdist = dist - ((bias[i] | 0) >> (intbiasshift - netbiasshift));
        if (biasdist < bestbiasd) { bestbiasd = biasdist; bestbiaspos = i; }
        var betafreq = (freq[i] >> betashift);
        freq[i] -= betafreq;
        bias[i] += (betafreq << gammashift);
      }
      freq[bestpos] += beta;
      bias[bestpos] -= betagamma;
      return bestbiaspos;
    }

    function inxbuild() {
      var previouscol = 0, startpos = 0;
      for (var i = 0; i < netsize; i++) {
        var p = network[i], smallpos = i, smallval = p[1];
        for (var j = i + 1; j < netsize; j++) {
          var q = network[j];
          if (q[1] < smallval) { smallpos = j; smallval = q[1]; }
        }
        var q = network[smallpos];
        if (i != smallpos) {
          var x = q[0]; q[0] = p[0]; p[0] = x;
          x = q[1]; q[1] = p[1]; p[1] = x;
          x = q[2]; q[2] = p[2]; p[2] = x;
          x = q[3]; q[3] = p[3]; p[3] = x;
        }
        if (smallval != previouscol) {
          netindex[previouscol] = (startpos + i) >> 1;
          for (var j = previouscol + 1; j < smallval; j++) netindex[j] = i;
          previouscol = smallval;
          startpos = i;
        }
      }
      netindex[previouscol] = (startpos + (netsize - 1)) >> 1;
      for (var j = previouscol + 1; j < 256; j++) netindex[j] = netsize - 1;
    }

    function lookupRGB(b, g, r) {
      var bestd = 1000, best = -1, i = netindex[g] | 0, j = i - 1;
      while ((i < netsize) || (j >= 0)) {
        if (i < netsize) {
          var p = network[i];
          var dist = (p[1] | 0) - g;
          if (dist >= bestd) i = netsize;
          else {
            i++;
            if (dist < 0) dist = -dist;
            var a = (p[0] | 0) - b; if (a < 0) a = -a; dist += a;
            if (dist < bestd) {
              a = (p[2] | 0) - r; if (a < 0) a = -a; dist += a;
              if (dist < bestd) { bestd = dist; best = p[3] | 0; }
            }
          }
        }
        if (j >= 0) {
          var p = network[j];
          var dist = g - (p[1] | 0);
          if (dist >= bestd) j = -1;
          else {
            j--;
            if (dist < 0) dist = -dist;
            var a = (p[0] | 0) - b; if (a < 0) a = -a; dist += a;
            if (dist < bestd) {
              a = (p[2] | 0) - r; if (a < 0) a = -a; dist += a;
              if (dist < bestd) { bestd = dist; best = p[3] | 0; }
            }
          }
        }
      }
      return best;
    }

    function learn() {
      var lengthcount = pixels.length;
      var alphadec = 30 + ((samplefac - 1) / 3);
      var samplepixels = lengthcount / (3 * samplefac);
      var delta = ~~(samplepixels / 100);
      var alpha = initalpha, radius = initradius;
      var rad = radius >> radiusbiasshift;
      if (rad <= 1) rad = 0;
      for (var i = 0; i < rad; i++) {
        radpower[i] = alpha * (((rad * rad - i * i) * radbias) / (rad * rad));
      }
      var step = 3;
      if (lengthcount >= minpicturebytes) {
        step = (lengthcount % prime1 !== 0) ? (3 * prime1) : (lengthcount % prime2 !== 0) ? (3 * prime2) : (lengthcount % prime3 !== 0) ? (3 * prime3) : (3 * prime4);
      }
      var pix = 0;
      for (var i = 0; i < samplepixels;) {
        var b = (pixels[pix] & 0xff) << netbiasshift;
        var g = (pixels[pix + 1] & 0xff) << netbiasshift;
        var r = (pixels[pix + 2] & 0xff) << netbiasshift;
        var j = contest(b, g, r);
        altersingle(alpha, j, b, g, r);
        if (rad !== 0) alterneigh(rad, j, b, g, r);
        pix += step;
        if (pix >= lengthcount) pix -= lengthcount;
        i++;
        if (delta === 0) delta = 1;
        if (i % delta === 0) {
          alpha -= alpha / alphadec;
          radius -= radius / radiusdec;
          rad = radius >> radiusbiasshift;
          if (rad <= 1) rad = 0;
          for (var k = 0; k < rad; k++) {
            radpower[k] = alpha * (((rad * rad - k * k) * radbias) / (rad * rad));
          }
        }
      }
    }

    this.buildColormap = function() {
      init();
      learn();
      unbiasnet();
      inxbuild();
    };

    this.getColormap = function() {
      var map = new Uint8Array(netsize * 3);
      var index = [];
      for (var i = 0; i < netsize; i++) index[network[i][3]] = i;
      var k = 0;
      for (var l = 0; l < netsize; l++) {
        var j = index[l];
        map[k++] = network[j][0];
        map[k++] = network[j][1];
        map[k++] = network[j][2];
      }
      return map;
    };

    this.lookupRGB = lookupRGB;
  }

  function GIFEncoder(width, height) {
    this.width = ~~width;
    this.height = ~~height;
    this.transparent = null;
    this.transIndex = 0;
    this.hasTransparency = false;
    this.repeat = -1;
    this.delay = 0;
    this.image = null;
    this.indexedPixels = null;
    this.colorDepth = 8;
    this.colorTab = null;
    this.palSize = 7;
    this.dispose = -1;
    this.firstFrame = true;
    this.sample = 10;
    this.dither = false;
    this.globalPalette = false;
    this.out = new ByteArray();
  }

  GIFEncoder.prototype.setDelay = function(ms) {
    this.delay = Math.round(ms / 10);
  };
  GIFEncoder.prototype.setDispose = function(code) {
    if (code >= 0) this.dispose = code;
  };
  GIFEncoder.prototype.setRepeat = function(repeat) {
    this.repeat = repeat;
  };
  GIFEncoder.prototype.setTransparent = function(color) {
    this.transparent = color;
  };
  GIFEncoder.prototype.setQuality = function(q) {
    if (q < 1) q = 1;
    this.sample = q;
  };
  GIFEncoder.prototype.setDither = function(d) {
    this.dither = d;
  };
  GIFEncoder.prototype.setGlobalPalette = function(p) {
    this.globalPalette = p;
  };
  GIFEncoder.prototype.getGlobalPalette = function() {
    return this.colorTab;
  };
  GIFEncoder.prototype.writeHeader = function() {
    this.out.writeUTFBytes("GIF89a");
  };

  GIFEncoder.prototype.analyzePixels = function() {
    var w = this.width;
    var h = this.height;
    var nPix = w * h;
    var data = this.image; // RGBA Uint8ClampedArray / Uint8Array

    // Check for transparency
    var transCount = 0;
    var opaqueCount = 0;
    var isTransparentConfigured = (this.transparent !== null && this.transparent !== false);

    for (var i = 0; i < nPix; i++) {
      if (data[i * 4 + 3] < 128) {
        transCount++;
      } else {
        opaqueCount++;
      }
    }

    var wantTransparency = isTransparentConfigured && (transCount > 0);
    this.hasTransparency = wantTransparency;
    this.transIndex = wantTransparency ? 0 : -1;

    // Collect unique opaque colors
    var colorMap = new Map();
    var uniqueColors = [];

    for (var i = 0; i < nPix; i++) {
      if (data[i * 4 + 3] >= 128) {
        var r = data[i * 4];
        var g = data[i * 4 + 1];
        var b = data[i * 4 + 2];
        var key = (r << 16) | (g << 8) | b;
        if (!colorMap.has(key)) {
          var idx = (wantTransparency ? 1 : 0) + uniqueColors.length;
          colorMap.set(key, idx);
          uniqueColors.push({ r: r, g: g, b: b });
        }
      }
    }

    var maxExactColors = wantTransparency ? 255 : 256;
    this.colorTab = new Uint8Array(768);
    this.indexedPixels = new Uint8Array(nPix);

    if (uniqueColors.length <= maxExactColors) {
      // Exact palette for pixel art!
      if (wantTransparency) {
        this.colorTab[0] = 0;
        this.colorTab[1] = 0;
        this.colorTab[2] = 0;
        for (var k = 0; k < uniqueColors.length; k++) {
          var c = uniqueColors[k];
          var pos = (k + 1) * 3;
          this.colorTab[pos] = c.r;
          this.colorTab[pos + 1] = c.g;
          this.colorTab[pos + 2] = c.b;
        }
      } else {
        for (var k = 0; k < uniqueColors.length; k++) {
          var c = uniqueColors[k];
          var pos = k * 3;
          this.colorTab[pos] = c.r;
          this.colorTab[pos + 1] = c.g;
          this.colorTab[pos + 2] = c.b;
        }
      }

      for (var j = 0; j < nPix; j++) {
        if (data[j * 4 + 3] < 128) {
          this.indexedPixels[j] = 0;
        } else {
          var r = data[j * 4];
          var g = data[j * 4 + 1];
          var b = data[j * 4 + 2];
          var key = (r << 16) | (g << 8) | b;
          this.indexedPixels[j] = colorMap.get(key) || 0;
        }
      }
    } else {
      // Quantization with NeuQuant for > 256 colors
      var samplePixels = new Uint8Array(Math.max(3, opaqueCount * 3));
      var sc = 0;
      for (var i = 0; i < nPix; i++) {
        if (data[i * 4 + 3] >= 128) {
          samplePixels[sc++] = data[i * 4];
          samplePixels[sc++] = data[i * 4 + 1];
          samplePixels[sc++] = data[i * 4 + 2];
        }
      }

      var nq = new NeuQuant(samplePixels, this.sample);
      nq.buildColormap();
      var qMap = nq.getColormap();

      if (wantTransparency) {
        this.colorTab[0] = 0;
        this.colorTab[1] = 0;
        this.colorTab[2] = 0;
        for (var k = 0; k < 255; k++) {
          this.colorTab[(k + 1) * 3] = qMap[k * 3];
          this.colorTab[(k + 1) * 3 + 1] = qMap[k * 3 + 1];
          this.colorTab[(k + 1) * 3 + 2] = qMap[k * 3 + 2];
        }
        for (var j = 0; j < nPix; j++) {
          if (data[j * 4 + 3] < 128) {
            this.indexedPixels[j] = 0;
          } else {
            var r = data[j * 4];
            var g = data[j * 4 + 1];
            var b = data[j * 4 + 2];
            var bestIdx = 1 + nq.lookupRGB(b, g, r);
            this.indexedPixels[j] = Math.min(255, bestIdx);
          }
        }
      } else {
        for (var k = 0; k < 256; k++) {
          this.colorTab[k * 3] = qMap[k * 3];
          this.colorTab[k * 3 + 1] = qMap[k * 3 + 1];
          this.colorTab[k * 3 + 2] = qMap[k * 3 + 2];
        }
        for (var j = 0; j < nPix; j++) {
          var r = data[j * 4];
          var g = data[j * 4 + 1];
          var b = data[j * 4 + 2];
          this.indexedPixels[j] = nq.lookupRGB(b, g, r);
        }
      }
    }
  };

  GIFEncoder.prototype.addFrame = function(imageData) {
    this.image = imageData;
    this.analyzePixels();
    if (this.firstFrame) {
      this.writeLSD();
      this.writePalette();
      if (this.repeat >= 0) {
        this.writeNetscapeExt();
      }
    }
    this.writeGraphicCtrlExt();
    this.writeImageDesc();
    if (!this.firstFrame) {
      this.writePalette();
    }
    this.writePixels();
    this.firstFrame = false;
  };

  GIFEncoder.prototype.finish = function() {
    this.out.writeByte(0x3b);
  };

  GIFEncoder.prototype.writeGraphicCtrlExt = function() {
    this.out.writeByte(0x21);
    this.out.writeByte(0xf9);
    this.out.writeByte(4);
    var transp = 0, disp = 0;
    if (this.hasTransparency) {
      transp = 1;
      disp = 2; // restore to background
    }
    if (this.dispose >= 0) {
      disp = this.dispose & 7;
    }
    disp <<= 2;
    this.out.writeByte(0 | disp | 0 | transp);
    this.writeShort(this.delay);
    this.out.writeByte(this.hasTransparency ? this.transIndex : 0);
    this.out.writeByte(0);
  };

  GIFEncoder.prototype.writeImageDesc = function() {
    this.out.writeByte(0x2c);
    this.writeShort(0);
    this.writeShort(0);
    this.writeShort(this.width);
    this.writeShort(this.height);
    this.firstFrame ? this.out.writeByte(0) : this.out.writeByte(0x80 | this.palSize);
  };

  GIFEncoder.prototype.writeLSD = function() {
    this.writeShort(this.width);
    this.writeShort(this.height);
    this.out.writeByte(0xf0 | this.palSize);
    this.out.writeByte(0);
    this.out.writeByte(0);
  };

  GIFEncoder.prototype.writeNetscapeExt = function() {
    this.out.writeByte(0x21);
    this.out.writeByte(0xff);
    this.out.writeByte(11);
    this.out.writeUTFBytes("NETSCAPE2.0");
    this.out.writeByte(3);
    this.out.writeByte(1);
    this.writeShort(this.repeat);
    this.out.writeByte(0);
  };

  GIFEncoder.prototype.writePalette = function() {
    this.out.writeBytes(this.colorTab);
    for (var t = 768 - this.colorTab.length, e = 0; e < t; e++) {
      this.out.writeByte(0);
    }
  };

  GIFEncoder.prototype.writeShort = function(val) {
    this.out.writeByte(val & 0xff);
    this.out.writeByte((val >> 8) & 0xff);
  };

  GIFEncoder.prototype.writePixels = function() {
    var lzw = new LZWEncoder(this.width, this.height, this.indexedPixels, this.colorDepth);
    lzw.encode(this.out);
  };

  GIFEncoder.prototype.stream = function() {
    return this.out;
  };

  self.onmessage = function(event) {
    var task = event.data;
    var encoder = new GIFEncoder(task.width, task.height);
    if (task.index === 0) {
      encoder.writeHeader();
    } else {
      encoder.firstFrame = false;
    }
    encoder.setTransparent(task.transparent);
    encoder.setRepeat(task.repeat);
    encoder.setDelay(task.delay);
    encoder.setQuality(task.quality);
    encoder.setDither(task.dither);
    encoder.setGlobalPalette(task.globalPalette);
    encoder.addFrame(task.data);
    if (task.last) {
      encoder.finish();
    }
    if (task.globalPalette === true) {
      task.globalPalette = encoder.getGlobalPalette();
    }
    var stream = encoder.stream();
    task.data = stream.pages;
    task.cursor = stream.cursor;
    task.pageSize = ByteArray.pageSize;

    if (task.canTransfer) {
      var transferList = [];
      for (var i = 0; i < stream.pages.length; i++) {
        transferList.push(stream.pages[i].buffer);
      }
      self.postMessage(task, transferList);
    } else {
      self.postMessage(task);
    }
  };
})();
`;

