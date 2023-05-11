import { Int } from "./primitive.js";

import type { CompoundTag } from "./tag.js";

export type Name = string | null;
export type Endian = "big" | "little";
export type Compression = "gzip" | "deflate";
export type BedrockLevel = Int;

export interface NBTDataOptions {
  name?: Name;
  endian?: Endian;
  compression?: Compression | null;
  bedrockLevel?: BedrockLevel | null;
}

/**
 * An object which represents a set of NBT data.
*/
export class NBTData<T extends CompoundTag = any> {
  declare readonly data: T;
  declare readonly name: Name;
  declare readonly endian: Endian;
  declare readonly compression: Compression | null;
  declare readonly bedrockLevel: BedrockLevel | null;

  constructor(data: CompoundTag | NBTData<T>, { name, endian, compression, bedrockLevel }: NBTDataOptions = {}) {
    if (data instanceof NBTData){
      if (name === undefined) name = data.name;
      if (endian === undefined) endian = data.endian;
      if (compression === undefined) compression = data.compression;
      if (bedrockLevel === undefined) bedrockLevel = data.bedrockLevel;
      data = data.data;
    }

    if (name === undefined) name = "";
    if (endian === undefined) endian = "big";
    if (compression === undefined) compression = null;
    if (bedrockLevel === undefined) bedrockLevel = null;

    if (typeof data !== "object" || data === null){
      throw new TypeError("First parameter must be an object");
    }
    if (typeof name !== "string" && name !== null){
      throw new TypeError("Name option must be a string or null");
    }
    if (endian !== "big" && endian !== "little"){
      throw new TypeError("Endian option must be a valid endian type");
    }
    if (compression !== null && compression !== "gzip" && compression !== "deflate"){
      throw new TypeError("Compression option must be a valid compression type");
    }
    if (bedrockLevel !== null && !(bedrockLevel instanceof Int)){
      throw new TypeError("Bedrock Level option must be an Int");
    }

    Object.defineProperty(this,"data",{
      configurable: true,
      enumerable: true,
      value: data
    });

    Object.defineProperty(this,"name",{
      configurable: true,
      enumerable: true,
      value: name
    });

    Object.defineProperty(this,"endian",{
      configurable: true,
      enumerable: true,
      value: endian
    });

    Object.defineProperty(this,"compression",{
      configurable: true,
      enumerable: (compression !== null),
      value: compression
    });

    Object.defineProperty(this,"bedrockLevel",{
      configurable: true,
      enumerable: (bedrockLevel !== null),
      value: bedrockLevel
    });
  }

  get [Symbol.toStringTag]() {
    return "NBTData" as const;
  }
}