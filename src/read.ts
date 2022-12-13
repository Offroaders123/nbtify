import { Name, Endian, Compression, BedrockLevel, NBTData } from "./index.js";
import { Byte, Short, Int, Float } from "./primitive.js";
import { Tag, ListTag, CompoundTag, TAG } from "./tag.js";
import { decompress } from "./compression.js";

export interface ReadOptions {
  endian?: Endian;
  compression?: Compression | null;
  isNamed?: boolean;
  isBedrockLevel?: boolean;
}

/**
 * Converts an NBT buffer into an NBTData object. Accepts an endian type, compression format, and file headers to read the data with.
 * 
 * If a format option isn't specified, the function will attempt reading the data using all options until it either throws or returns successfully.
*/
export async function read(data: Uint8Array | ArrayBufferLike, { endian, compression, isNamed, isBedrockLevel }: ReadOptions = {}){
  if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer){
    data = new Uint8Array(data);
  }

  if (!(data instanceof Uint8Array)){
    throw new TypeError("First parameter must be a Uint8Array, ArrayBuffer, or SharedArrayBuffer");
  }
  if (endian !== undefined && endian !== "big" && endian !== "little"){
    throw new TypeError("Endian option must be a valid endian type");
  }
  if (compression !== undefined && compression !== null && compression !== "gzip" && compression !== "zlib"){
    throw new TypeError("Compression option must be a valid compression type");
  }
  if (isNamed !== undefined && typeof isNamed !== "boolean"){
    throw new TypeError("Named option must be a boolean");
  }
  if (isBedrockLevel !== undefined && typeof isBedrockLevel !== "boolean"){
    throw new TypeError("Bedrock Level option must be a boolean");
  }

  if (compression === undefined){
    compression = (hasGzipHeader(data)) ? "gzip" : null;
  }

  if (endian === undefined){
    let result: NBTData;
    try {
      result = await read(data,{ endian: "big", compression, isNamed, isBedrockLevel });
    } catch (error){
      try {
        result = await read(data,{ endian: "little", compression, isNamed, isBedrockLevel });
      } catch {
        throw error;
      }
    }
    return result;
  }

  if (isNamed === undefined){
    let result: NBTData;
    try {
      result = await read(data,{ endian, compression, isNamed: true, isBedrockLevel });
    } catch (error){
      try {
        result = await read(data,{ endian, compression, isNamed: false, isBedrockLevel });
      } catch {
        throw error;
      }
    }
    return result;
  }

  if (compression === "gzip"){
    data = await decompress(data,{ format: "gzip" });
  }

  if (isBedrockLevel === undefined){
    isBedrockLevel = (endian === "little" && hasBedrockLevelHeader(data));
  }

  let bedrockLevel: BedrockLevel | null;

  if (isBedrockLevel){
    const view = new DataView(data.buffer,data.byteOffset,data.byteLength);
    const version = view.getUint32(0,true);
    bedrockLevel = new Int(version);
    data = data.subarray(8);
  } else {
    bedrockLevel = null;
  }

  const reader = new NBTReader();
  const result = reader.read(data,{ endian, isNamed });

  return new NBTData(result,{ compression, bedrockLevel });
}

function hasGzipHeader(data: Uint8Array){
  const view = new DataView(data.buffer,data.byteOffset,data.byteLength);
  const header = view.getUint16(0,false);
  return header === 0x1F8B;
}

function hasBedrockLevelHeader(data: Uint8Array){
  const view = new DataView(data.buffer,data.byteOffset,data.byteLength);
  const byteLength = view.getUint32(4,true);
  return byteLength === data.byteLength - 8;
}

const decoder = new TextDecoder();

export interface NBTReaderOptions {
  endian?: Endian;
  isNamed?: boolean;
}

/**
 * The base implementation to convert an NBT buffer into an NBTData object.
*/
export class NBTReader {
  #byteOffset!: number;
  #littleEndian!: boolean;
  #data!: Uint8Array;
  #view!: DataView;

  /**
   * Initiates the reader over an NBT buffer.
  */
  read(data: Uint8Array | ArrayBufferLike, { endian = "big", isNamed = true }: NBTReaderOptions = {}) {
    if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer){
      data = new Uint8Array(data);
    }

    if (!(data instanceof Uint8Array)){
      throw new TypeError("First parameter must be a Uint8Array, ArrayBuffer, or SharedArrayBuffer");
    }
    if (endian !== "big" && endian !== "little"){
      throw new TypeError("Endian option must be a valid endian type");
    }
    if (typeof isNamed !== "boolean"){
      throw new TypeError("Named option must be a boolean");
    }

    this.#byteOffset = 0;
    this.#littleEndian = (endian === "little");
    this.#data = data;
    this.#view = new DataView(data.buffer,data.byteOffset,data.byteLength);

    const type = this.#readTagType();
    if (type !== TAG.COMPOUND){
      throw new Error(`Expected an opening Compound tag at the start of the buffer, encountered tag type ${type}`);
    }

    const name: Name = (isNamed) ? this.#readString() : null;
    const value = this.#readCompound();

    if (data.byteLength > this.#byteOffset){
      const remaining = data.byteLength - this.#byteOffset;
      throw new Error(`Encountered unexpected End tag at byte offset ${this.#byteOffset}, ${remaining} unread bytes remaining`);
    }

    return new NBTData(value,{ name, endian });
  }

  #readTag(type: TAG): Tag {
    switch (type){
      case TAG.END: {
        const remaining = this.#data.byteLength - this.#byteOffset;
        throw new Error(`Encountered unexpected End tag at byte offset ${this.#byteOffset}, ${remaining} unread bytes remaining`);
      }
      case TAG.BYTE: return new Byte(this.#readByte());
      case TAG.SHORT: return new Short(this.#readShort());
      case TAG.INT: return new Int(this.#readInt());
      case TAG.LONG: return this.#readLong();
      case TAG.FLOAT: return new Float(this.#readFloat());
      case TAG.DOUBLE: return this.#readDouble();
      case TAG.BYTE_ARRAY: return this.#readByteArray();
      case TAG.STRING: return this.#readString();
      case TAG.LIST: return this.#readList();
      case TAG.COMPOUND: return this.#readCompound();
      case TAG.INT_ARRAY: return this.#readIntArray();
      case TAG.LONG_ARRAY: return this.#readLongArray();
      default: throw new Error(`Encountered unsupported tag type ${type} at byte offset ${this.#byteOffset}`);
    }
  }

  #readTagType() {
    return this.#readUnsignedByte() as TAG;
  }

  #readUnsignedByte() {
    if (this.#byteOffset + 1 > this.#data.byteLength){
      throw new Error("Ran out of bytes to read, unexpectedly reached the end of the buffer");
    }
    const value = this.#view.getUint8(this.#byteOffset);
    this.#byteOffset += 1;
    return value;
  }

  #readByte() {
    if (this.#byteOffset + 1 > this.#data.byteLength){
      throw new Error("Ran out of bytes to read, unexpectedly reached the end of the buffer");
    }
    const value = this.#view.getInt8(this.#byteOffset);
    this.#byteOffset += 1;
    return value;
  }

  #readUnsignedShort() {
    if (this.#byteOffset + 2 > this.#data.byteLength){
      throw new Error("Ran out of bytes to read, unexpectedly reached the end of the buffer");
    }
    const value = this.#view.getUint16(this.#byteOffset,this.#littleEndian);
    this.#byteOffset += 2;
    return value;
  }

  #readShort() {
    if (this.#byteOffset + 2 > this.#data.byteLength){
      throw new Error("Ran out of bytes to read, unexpectedly reached the end of the buffer");
    }
    const value = this.#view.getInt16(this.#byteOffset,this.#littleEndian);
    this.#byteOffset += 2;
    return value;
  }

  #readInt() {
    if (this.#byteOffset + 4 > this.#data.byteLength){
      throw new Error("Ran out of bytes to read, unexpectedly reached the end of the buffer");
    }
    const value = this.#view.getInt32(this.#byteOffset,this.#littleEndian);
    this.#byteOffset += 4;
    return value;
  }

  #readLong() {
    if (this.#byteOffset + 8 > this.#data.byteLength){
      throw new Error("Ran out of bytes to read, unexpectedly reached the end of the buffer");
    }
    const value = this.#view.getBigInt64(this.#byteOffset,this.#littleEndian);
    this.#byteOffset += 8;
    return value;
  }

  #readFloat() {
    if (this.#byteOffset + 4 > this.#data.byteLength){
      throw new Error("Ran out of bytes to read, unexpectedly reached the end of the buffer");
    }
    const value = this.#view.getFloat32(this.#byteOffset,this.#littleEndian);
    this.#byteOffset += 4;
    return value;
  }

  #readDouble() {
    if (this.#byteOffset + 8 > this.#data.byteLength){
      throw new Error("Ran out of bytes to read, unexpectedly reached the end of the buffer");
    }
    const value = this.#view.getFloat64(this.#byteOffset,this.#littleEndian);
    this.#byteOffset += 8;
    return value;
  }

  #readByteArray() {
    const byteLength = this.#readInt();
    if (this.#byteOffset + byteLength > this.#data.byteLength){
      throw new Error("Ran out of bytes to read, unexpectedly reached the end of the buffer");
    }
    const value = new Int8Array(this.#data.subarray(this.#byteOffset,this.#byteOffset + byteLength));
    this.#byteOffset += byteLength;
    return value;
  }

  #readString() {
    const length = this.#readUnsignedShort();
    if (this.#byteOffset + length > this.#data.byteLength){
      throw new Error("Ran out of bytes to read, unexpectedly reached the end of the buffer");
    }
    const value = decoder.decode(this.#data.subarray(this.#byteOffset,this.#byteOffset + length));
    this.#byteOffset += length;
    return value;
  }

  #readList() {
    const type = this.#readTagType();
    const length = this.#readInt();
    const value: ListTag = [];
    for (let i = 0; i < length; i++){
      const entry = this.#readTag(type);
      value.push(entry);
    }
    return value;
  }

  #readCompound() {
    const value: CompoundTag = {};
    while (true){
      const type = this.#readTagType();
      if (type === TAG.END) break;
      const name = this.#readString();
      const entry = this.#readTag(type);
      value[name] = entry;
    }
    return value;
  }

  #readIntArray() {
    const byteLength = this.#readInt();
    const value = new Int32Array(byteLength);
    for (const i in value){
      const entry = this.#readInt();
      value[i] = entry;
    }
    return value;
  }

  #readLongArray() {
    const byteLength = this.#readInt();
    const value = new BigInt64Array(byteLength);
    for (const i in value){
      const entry = this.#readLong();
      value[i] = entry;
    }
    return value;
  }
}