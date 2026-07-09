/**
 * Minimal, dependency-free ZIP writer (STORED/uncompressed entries only).
 * Deliberately not using a third-party library (e.g. JSZip): a stored-mode
 * ZIP needs no DEFLATE implementation, just headers + CRC32, so writing it
 * by hand keeps this page 100% self-contained with zero external/CDN code.
 */

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32LE(arr, offset, value) {
    arr[offset] = value & 0xff;
    arr[offset + 1] = (value >>> 8) & 0xff;
    arr[offset + 2] = (value >>> 16) & 0xff;
    arr[offset + 3] = (value >>> 24) & 0xff;
}

function writeUint16LE(arr, offset, value) {
    arr[offset] = value & 0xff;
    arr[offset + 1] = (value >>> 8) & 0xff;
}

/**
 * files: [{ name: string, content: string }]
 * Returns a Blob containing a valid, uncompressed .zip archive.
 */
function createZipBlob(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
        const nameBytes = encoder.encode(file.name);
        const dataBytes = encoder.encode(file.content);
        const crc = crc32(dataBytes);

        const localHeader = new Uint8Array(30 + nameBytes.length);
        writeUint32LE(localHeader, 0, 0x04034b50);
        writeUint16LE(localHeader, 4, 20);    // version needed to extract
        writeUint16LE(localHeader, 6, 0);     // general purpose flags
        writeUint16LE(localHeader, 8, 0);     // compression method: stored
        writeUint16LE(localHeader, 10, 0);    // mod time
        writeUint16LE(localHeader, 12, 0x21); // mod date (arbitrary valid DOS date)
        writeUint32LE(localHeader, 14, crc);
        writeUint32LE(localHeader, 18, dataBytes.length); // compressed size
        writeUint32LE(localHeader, 22, dataBytes.length); // uncompressed size
        writeUint16LE(localHeader, 26, nameBytes.length);
        writeUint16LE(localHeader, 28, 0);    // extra field length
        localHeader.set(nameBytes, 30);

        localParts.push(localHeader, dataBytes);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        writeUint32LE(centralHeader, 0, 0x02014b50);
        writeUint16LE(centralHeader, 4, 20);  // version made by
        writeUint16LE(centralHeader, 6, 20);  // version needed
        writeUint16LE(centralHeader, 8, 0);
        writeUint16LE(centralHeader, 10, 0);
        writeUint16LE(centralHeader, 12, 0);
        writeUint16LE(centralHeader, 14, 0x21);
        writeUint32LE(centralHeader, 16, crc);
        writeUint32LE(centralHeader, 20, dataBytes.length);
        writeUint32LE(centralHeader, 24, dataBytes.length);
        writeUint16LE(centralHeader, 28, nameBytes.length);
        writeUint16LE(centralHeader, 30, 0);  // extra field length
        writeUint16LE(centralHeader, 32, 0);  // file comment length
        writeUint16LE(centralHeader, 34, 0);  // disk number start
        writeUint16LE(centralHeader, 36, 0);  // internal file attributes
        writeUint32LE(centralHeader, 38, 0);  // external file attributes
        writeUint32LE(centralHeader, 42, offset);
        centralHeader.set(nameBytes, 46);

        centralParts.push(centralHeader);

        offset += localHeader.length + dataBytes.length;
    }

    const centralDirOffset = offset;
    let centralDirSize = 0;
    for (const part of centralParts) centralDirSize += part.length;

    const eocd = new Uint8Array(22);
    writeUint32LE(eocd, 0, 0x06054b50);
    writeUint16LE(eocd, 4, 0);
    writeUint16LE(eocd, 6, 0);
    writeUint16LE(eocd, 8, files.length);
    writeUint16LE(eocd, 10, files.length);
    writeUint32LE(eocd, 12, centralDirSize);
    writeUint32LE(eocd, 16, centralDirOffset);
    writeUint16LE(eocd, 20, 0);

    return new Blob([...localParts, ...centralParts, eocd], { type: "application/zip" });
}
