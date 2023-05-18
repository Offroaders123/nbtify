import { Name, Endian, Compression, BedrockLevel, NBTData } from "./data.js";
import { TAG, getTagType } from "./tag.js";
import { Int32 } from "./primitive.js";
import { compress } from "./compression.js";

import type { RootTag, Tag, ByteTag, BooleanTag, ShortTag, IntTag, LongTag, FloatTag, DoubleTag, ByteArrayTag, StringTag, ListTag, CompoundTag, IntArrayTag, LongArrayTag } from "./tag.js";

export interface WriteOptions {
  name?: Name;
  endian?: Endian;
  compression?: Compression;
  bedrockLevel?: BedrockLevel;
}

/**
 * Converts an NBTData object into an NBT buffer. Accepts an endian type, compression format, and file headers to write the data with.
 * 
 * If a format option isn't specified, the value of the equivalent property on the NBTData object will be used.
*/
export async function write(data: RootTag | NBTData, { name, endian, compression, bedrockLevel }: WriteOptions = {}){
  if (data instanceof NBTData){
    if (name === undefined) name = data.name;
    if (endian === undefined) endian = data.endian;
    if (compression === undefined) compression = data.compression;
    if (bedrockLevel === undefined) bedrockLevel = data.bedrockLevel;
    data = data.data as CompoundTag;
  }

  if (typeof data !== "object" || data === null){
    throw new TypeError("First parameter must be an object");
  }
  if (name !== undefined && typeof name !== "string" && name !== null){
    throw new TypeError("Name option must be a string or null");
  }
  if (endian !== undefined && endian !== "big" && endian !== "little"){
    throw new TypeError("Endian option must be a valid endian type");
  }
  if (compression !== undefined && compression !== "deflate" && compression !== "deflate-raw" && compression !== "gzip" && compression !== null){
    throw new TypeError("Compression option must be a valid compression type");
  }
  if (bedrockLevel !== undefined && !(bedrockLevel instanceof Int32) && bedrockLevel !== null){
    throw new TypeError("Bedrock Level option must be an Int32 or null");
  }

  const writer = new NBTWriter();
  let result = writer.write(data,{ name, endian });

  if (bedrockLevel !== undefined && bedrockLevel !== null){
    const { byteLength } = result;
    const data = new Uint8Array(byteLength + 8);
    const view = new DataView(data.buffer);
    const version = bedrockLevel.valueOf();
    view.setUint32(0,version,true);
    view.setUint32(4,byteLength,true);
    data.set(result,8);
    result = data;
  }

  if (compression !== undefined && compression !== null){
    result = await compress(result,compression);
  }

  return result;
}

export interface NBTWriterOptions {
  name?: Name;
  endian?: Endian;
}

/**
 * The base implementation to convert an NBTData object into an NBT buffer.
*/
export class NBTWriter {
  #byteOffset!: number;
  #littleEndian!: boolean;
  #data!: Uint8Array;
  #view!: DataView;
  #encoder = new TextEncoder();

  /**
   * Initiates the writer over an NBTData object.
  */
  write(data: RootTag | NBTData, { name, endian }: NBTWriterOptions = {}) {
    if (data instanceof NBTData){
      if (name === undefined) name = data.name;
      if (endian === undefined) endian = data.endian;
      data = data.data as CompoundTag;
    }

    if (name === undefined) name = "";
    if (endian === undefined) endian = "big";

    if (typeof data !== "object" || data === null){
      throw new TypeError("First parameter must be an object");
    }
    if (typeof name !== "string" && name !== null){
      throw new TypeError("Name option must be a string or null");
    }
    if (endian !== "big" && endian !== "little"){
      throw new TypeError("Endian option must be a valid endian type");
    }

    this.#byteOffset = 0;
    this.#littleEndian = (endian === "little");
    this.#data = new Uint8Array(1024);
    this.#view = new DataView(this.#data.buffer);

    this.#writeTagType(TAG.COMPOUND);
    if (name !== null) this.#writeString(name);
    // @ts-expect-error
    this.#writeCompound(data);

    this.#allocate(0);
    return this.#data.slice(0,this.#byteOffset);
  }

  #allocate(byteLength: number) {
    const required = this.#byteOffset + byteLength;
    if (this.#data.byteLength >= required) return;

    let length = this.#data.byteLength;

    while (length < required){
      length *= 2;
    }

    const data = new Uint8Array(length);
    data.set(this.#data,0);

    if (this.#byteOffset > this.#data.byteLength){
      data.fill(0,byteLength,this.#byteOffset);
    }

    this.#data = data;
    this.#view = new DataView(data.buffer);
  }

  #writeTag(value: Tag) {
    const type = getTagType(value);
    switch (type){
      case TAG.BYTE: return this.#writeByte(Number(value as ByteTag | BooleanTag));
      case TAG.SHORT: return this.#writeShort((value as ShortTag).valueOf());
      case TAG.INT: return this.#writeInt((value as IntTag).valueOf());
      case TAG.LONG: return this.#writeLong(value as LongTag);
      case TAG.FLOAT: return this.#writeFloat((value as FloatTag).valueOf());
      case TAG.DOUBLE: return this.#writeDouble(value as DoubleTag);
      case TAG.BYTE_ARRAY: return this.#writeByteArray(value as ByteArrayTag);
      case TAG.STRING: return this.#writeString(value as StringTag);
      case TAG.LIST: return this.#writeList(value as ListTag);
      case TAG.COMPOUND: return this.#writeCompound(value as CompoundTag);
      case TAG.INT_ARRAY: return this.#writeIntArray(value as IntArrayTag);
      case TAG.LONG_ARRAY: return this.#writeLongArray(value as LongArrayTag);
    }
  }

  #writeTagType(type: TAG) {
    this.#writeUnsignedByte(type);
  }

  #writeUnsignedByte(value: number) {
    this.#allocate(1);
    this.#view.setUint8(this.#byteOffset,value);
    this.#byteOffset += 1;
  }

  #writeByte(value: number) {
    this.#allocate(1);
    this.#view.setInt8(this.#byteOffset,value);
    this.#byteOffset += 1;
  }

  #writeUnsignedShort(value: number) {
    this.#allocate(2);
    this.#view.setUint16(this.#byteOffset,value,this.#littleEndian);
    this.#byteOffset += 2;
  }

  #writeShort(value: number) {
    this.#allocate(2);
    this.#view.setInt16(this.#byteOffset,value,this.#littleEndian);
    this.#byteOffset += 2;
  }

  #writeInt(value: number) {
    this.#allocate(4);
    this.#view.setInt32(this.#byteOffset,value,this.#littleEndian);
    this.#byteOffset += 4;
  }

  #writeLong(value: bigint) {
    this.#allocate(8);
    this.#view.setBigInt64(this.#byteOffset,value,this.#littleEndian);
    this.#byteOffset += 8;
  }

  #writeFloat(value: number) {
    this.#allocate(4);
    this.#view.setFloat32(this.#byteOffset,value,this.#littleEndian);
    this.#byteOffset += 4;
  }

  #writeDouble(value: number) {
    this.#allocate(8);
    this.#view.setFloat64(this.#byteOffset,value,this.#littleEndian);
    this.#byteOffset += 8;
  }

  #writeByteArray(value: Int8Array) {
    const { length } = value;
    this.#writeInt(length);
    this.#allocate(length);
    this.#data.set(value,this.#byteOffset);
    this.#byteOffset += length;
  }

  #writeString(value: string) {
    const entry = this.#encoder.encode(value);
    const { length } = entry;
    this.#writeUnsignedShort(length);
    this.#allocate(length);
    this.#data.set(entry,this.#byteOffset);
    this.#byteOffset += length;
  }

  #writeList(valueUnsafe: ListTag) {
    const value = valueUnsafe.filter((entry): entry is Tag => getTagType(entry) !== null);
    const type = (value.length !== 0) ? getTagType(value[0])! : TAG.END;
    const { length } = value;
    this.#writeTagType(type);
    this.#writeInt(length);
    for (const entry of value){
      if (getTagType(entry) !== type){
        throw new TypeError("Encountered unexpected item type in array, all tags in a List tag must be of the same type");
      }
      this.#writeTag(entry);
    }
  }

  #writeCompound(valueUnsafe: CompoundTag) {
    for (const [name,entry] of Object.entries(valueUnsafe)){
      const type = getTagType(entry);
      if (type === null) continue;
      this.#writeTagType(type);
      this.#writeString(name);
      this.#writeTag(entry as Tag);
    }
    this.#writeTagType(TAG.END);
  }

  #writeIntArray(value: Int32Array) {
    const { length } = value;
    this.#writeInt(length);
    for (const entry of value){
      this.#writeInt(entry);
    }
  }

  #writeLongArray(value: BigInt64Array) {
    const { length } = value;
    this.#writeInt(length);
    for (const entry of value){
      this.#writeLong(entry);
    }
  }
}