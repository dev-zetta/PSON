import * as ByteBuffer from "bytebuffer";
import {
    ARRAY, BINARY, DOUBLE, EARRAY, EOBJECT, ESTRING, FALSE, FLOAT, INTEGER, LONG, MAX, NULL, OBJECT, STRING, STRING_ADD,
    STRING_GET,
    TRUE
} from "./T";
import * as Long from "long";

/**
 * Float conversion test buffer.
 * @type {!ByteBuffer}
 */
const fbuf = new ByteBuffer(4);
fbuf.length = 4;

/**
 * Constructs a new PSON Encoder.
 * @exports PSON.Encoder
 * @class A PSON Encoder.
 * @param {Array.<string>=} dict Initial dictionary
 * @param {boolean} progressive Whether this is a progressive or a static encoder
 * @param {Object.<string,*>=} options Options
 * @constructor
 */
export class Encoder {
    /**
     * Dictionary hash.
     * @type {Object.<string,number>}
     */
    private dict: { [key: string]: number } = {};

    /**
     * Next dictionary index.
     * @type {number}
     */
    next: number = 0;

    constructor(dict: string[] = [], private progressive: boolean, options: { [opt: string]: any }) {
        if (dict) {
            while (this.next < dict.length) {
                this.dict[dict[this.next]] = this.next++;
            }
        }
    }

    /**
     * Encodes JSON to PSON.
     * @param {*} json JSON
     * @param {(!ByteBuffer)=} buf Buffer to encode to. When omitted, the resulting ByteBuffer will be flipped. When
     *  specified, it will not be flipped.
     * @returns {!ByteBuffer} PSON
     */
    encode(json: any, buf?: ByteBuffer): ByteBuffer {
        let doFlip = false;
        if (!buf) {
            buf = new ByteBuffer();
            doFlip = true;
        }
        const le = buf.littleEndian;
        try {
            this._encodeValue(json, buf.LE(), false);
            buf.littleEndian = le;
            return doFlip ? buf.flip() : buf;
        } catch (e) {
            buf.littleEndian = le;
            throw(e);
        }
    }

    /**
     * Encodes a single JSON value to PSON.
     * @param {*} val JSON value
     * @param {!ByteBuffer} buf Target buffer
     * @param {boolean=} excluded Whether keywords are to be excluded or not
     * @private
     */
    _encodeValue(val: any, buf: ByteBuffer, excluded: boolean) {
        if (val === null) {
            buf.writeUint8(NULL);
        } else {
            switch (typeof val) {
                case 'function':
                    val = val.toString();
                // fall through
                case 'string':
                    if (val.length === 0) {
                        buf.writeUint8(ESTRING);
                    } else {
                        if (this.dict.hasOwnProperty(val)) {
                            buf.writeUint8(STRING_GET);
                            buf.writeVarint32(this.dict[val]);
                        } else {
                            buf.writeUint8(STRING);
                            buf.writeVString(val);
                        }
                    }
                    break;
                case 'number':
                    const intVal = parseInt(val);
                    if (val === intVal) {
                        const zzval = ByteBuffer.zigZagEncode32(val); // unsigned
                        if (zzval <= MAX) {
                            buf.writeUint8(zzval);
                        } else {
                            buf.writeUint8(INTEGER);
                            buf.writeVarint32ZigZag(val);
                        }
                    } else {
                        fbuf.writeFloat32(val, 0);
                        if (val === fbuf.readFloat32(0)) {
                            buf.writeUint8(FLOAT);
                            buf.writeFloat32(val);
                        } else {
                            buf.writeUint8(DOUBLE);
                            buf.writeFloat64(val);
                        }
                    }
                    break;
                case 'boolean':
                    buf.writeUint8(val ? TRUE : FALSE);
                    break;
                case 'object':
                    let i;
                    if (Array.isArray(val)) {
                        if (val.length === 0) {
                            buf.writeUint8(EARRAY);
                        } else {
                            buf.writeUint8(ARRAY);
                            buf.writeVarint32(val.length);
                            for (i = 0; i < val.length; i++) {
                                this._encodeValue(val[i], buf, false);
                            }
                        }
                    } else if (Long && val instanceof Long) {
                        buf.writeUint8(LONG);
                        buf.writeVarint64ZigZag(val);
                    } else {
                        try {
                            val = ByteBuffer.wrap(val);
                            buf.writeUint8(BINARY);
                            buf.writeVarint32(val.remaining());
                            buf.append(val);
                        } catch (e) {
                            const keys = Object.keys(val);
                            let n = 0;
                            for (i = 0; i < keys.length; i++) {
                                if (typeof val[keys[i]] !== 'undefined') n++;
                            }
                            if (n === 0) {
                                buf.writeUint8(EOBJECT);
                            } else {
                                buf.writeUint8(OBJECT);
                                buf.writeVarint32(n);
                                if (!excluded) excluded = !!val._PSON_EXCL_;
                                for (i = 0; i < keys.length; i++) {
                                    const key = keys[i];
                                    if (typeof val[key] === 'undefined') continue;
                                    if (this.dict.hasOwnProperty(key)) {
                                        buf.writeUint8(STRING_GET);
                                        buf.writeVarint32(this.dict[key]);
                                    } else {
                                        if (this.progressive && !excluded) {
                                            // Add to dictionary
                                            this.dict[key] = this.next++;
                                            buf.writeUint8(STRING_ADD);
                                        } else {
                                            // Plain string
                                            buf.writeUint8(STRING);
                                        }
                                        buf.writeVString(key);
                                    }
                                    this._encodeValue(val[key], buf, false);
                                }
                            }
                        }
                    }
                    break;
                case 'undefined':
                    buf.writeUint8(NULL);
                    break;
            }
        }
    }
}

