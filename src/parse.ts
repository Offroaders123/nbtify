import { Int8, Int16, Int32, Float32 } from "./primitive.js";
import { TAG, getTagType } from "./tag.js";

import type { Tag, RootTag, ByteTag, BooleanTag, ShortTag, IntTag, LongTag, FloatTag, DoubleTag, ByteArrayTag, StringTag, ListTag, CompoundTag, IntArrayTag, LongArrayTag } from "./tag.js";

/**
 * Converts an SNBT string into a CompoundTag object.
*/
export function parse<T extends RootTag = any>(data: string): T {
  if (typeof data !== "string"){
    throw new TypeError("First parameter must be a string");
  }

  const reader = new SNBTReader();
  return reader.read<T>(data);
}

const WHITESPACE_PATTERN = /\s+/;
const INTEGER_PATTERN = /^([-+]?(?:0|[1-9][0-9]*))([bls]?)$/i;
const FLOAT_PATTERN = /^([-+]?(?:[0-9]+[.]?|[0-9]*[.][0-9]+)(?:e[-+]?[0-9]+)?)([df]?)$/i;
const BOOLEAN_PATTERN = /^(true|false)$/;
const UNQUOTED_STRING_OPEN_PATTERN = /^[0-9a-z_\-.+]+/i;

/**
 * The base implementation to convert an SNBT string into a CompoundTag object.
*/
export class SNBTReader {
  #data!: string;
  #byteOffset!: number;

  /**
   * Initiates the reader over an SNBT string.
  */
  read<T extends RootTag = any>(data: string): T {
    if (typeof data !== "string"){
      throw new TypeError("First parameter must be a string");
    }

    this.#data = data;
    this.#byteOffset = 0;

    const tag = this.#readCompoundTag() as T;
    const lastChar = this.#peek(-1);

    const endPos = this.#byteOffset;
    this.#skipWhitespace();

    if (this.#allocate(1)){
      const type = getTagType(tag);
      if (this.#byteOffset > endPos || type === TAG.LIST || type === TAG.COMPOUND || lastChar === "\"" || lastChar === "'"){
        throw new Error("Unexpected non-whitespace character after tag");
      }
      throw new Error(`Unexpected character '${this.#peek(0)}' at end of tag`);
    }
    return tag;
  }

  #allocate(byteLength: number): boolean {
    return (this.#byteOffset + byteLength <= this.#data.length);
  }

  #peek(byteOffset: number): string {
    return this.#data[this.#byteOffset + byteOffset];
  }

  #next(): string {
    return this.#data[this.#byteOffset++];
  }

  #skip(byteLength: number): void {
    this.#byteOffset += byteLength;
  }

  #skipSeperator(): boolean {
    this.#skipWhitespace();
    if (!this.#allocate(1) || this.#peek(0) !== ",") return false;

    this.#skip(1);
    this.#skipWhitespace();
    return true;
  }

  #skipWhitespace(): void {
    while (this.#allocate(1) && WHITESPACE_PATTERN.test(this.#peek(0))){
      this.#skip(1);
    }
  }

  #expect(character: string): void {
    if (!this.#allocate(1) || this.#peek(0) !== character){
      throw new Error(`Expected '${character}'`);
    }
    this.#byteOffset += 1;
  }

  #readTag(): Tag {
    this.#skipWhitespace();

    if (!this.#allocate(1)){
      throw new Error("Expected tag");
    }

    const char = this.#data[this.#byteOffset];
    if (char === "{") return this.#readCompoundTag();
    if (char === "[") return this.#readSomeList();
    if (char === "\"" || char === "'"){
      return this.#readQuotedString(char) as StringTag;
    }

    const string = this.#readUnquotedString();
    if (string === null){
      throw new Error(`Unexpected character '${char}' while reading tag`);
    }

    try {
      let match = string.match(INTEGER_PATTERN);
      if (match) return this.#readInteger(match);

      match = string.match(FLOAT_PATTERN);
      if (match) return this.#readFloat(match);

      if (BOOLEAN_PATTERN.test(string)) return Boolean(string);
    } catch {
      return string as StringTag;
    }
    return string as StringTag;
  }

  #readInteger([_,value,suffix]: RegExpMatchArray): ByteTag | ShortTag | IntTag | LongTag {
    switch (suffix){
      case "b":
      case "B": return new Int8(Number(value)) as ByteTag;
      case "s":
      case "S": return new Int16(Number(value)) as ShortTag;
      case "l":
      case "L": return BigInt(value) as LongTag;
      default: return new Int32(Number(value)) as IntTag;
    }
  }

  #readFloat([_,value,suffix]: RegExpMatchArray): FloatTag | DoubleTag {
    switch (suffix){
      case "f":
      case "F": return new Float32(Number(value)) as FloatTag;
      default: return Number(value) as DoubleTag;
    }
  }

  #readByteArray(tags: Tag[]): ByteArrayTag {
    const array = new Int8Array(tags.length);
    for (let i = 0; i < tags.length; i++){
      array[i] = tags[i].valueOf() as number;
    }
    return array as ByteArrayTag;
  }

  #readString(): StringTag | null {
    const char = this.#peek(0);
    return (char === "\"" || char === "'") ? this.#readQuotedString(char) : this.#readUnquotedString();
  }

  #readUnquotedString(): StringTag | null {
    const match = this.#data.slice(this.#byteOffset).match(UNQUOTED_STRING_OPEN_PATTERN);
    if (match === null) return null;

    this.#byteOffset += match[0].length;
    return match[0];
  }

  #readQuotedString(quoteChar: "\"" | "'"): StringTag {
    let lastPos = ++this.#byteOffset;
    let string = "";

    while (this.#allocate(1)){
      const char = this.#next();

      if (char === "\\"){
        if (!this.#allocate(1)){
          throw new Error("Unexpected end while reading escape sequence");
        }

        const escapeChar = this.#peek(0);

        if (escapeChar !== quoteChar && escapeChar !== "\\"){
          throw new Error(`Invalid escape character '${escapeChar}'`);
        }

        string += this.#data.slice(lastPos,this.#byteOffset - 1) + escapeChar;
        lastPos = ++this.#byteOffset;
      } else if (char === quoteChar){
        return string + this.#data.slice(lastPos,this.#byteOffset - 1);
      }
    }

    throw new Error(`Missing end quote`);
  }

  #readSomeList(): ByteArrayTag | ListTag | IntArrayTag | LongArrayTag {
    this.#expect("[");

    let tagType: typeof TAG.BYTE_ARRAY | typeof TAG.LIST | typeof TAG.INT_ARRAY | typeof TAG.LONG_ARRAY = TAG.LIST;

    if (this.#allocate(2) && this.#peek(1) === ";"){
      const char = this.#peek(0);

      switch (char){
        case "B": tagType = TAG.BYTE_ARRAY; break;
        case "I": tagType = TAG.INT_ARRAY; break;
        case "L": tagType = TAG.LONG_ARRAY; break;
        default: throw new Error(`Invalid array type '${char}'`);
      }

      this.#skip(2);
    }

    this.#skipWhitespace();

    const tags: Tag[] = [];

    while (this.#allocate(1) && this.#peek(0) !== "]"){
      const tag = this.#readTag();

      tags.push(tag);

      if (!this.#skipSeperator()){
        if (this.#peek(0) !== "]"){
          throw new Error(`Unexpected character '${this.#peek(0)}' at end of tag`);
        }
        break;
      }
    }

    if (!this.#allocate(1)){
      throw new Error("Expected tag or ']'");
    }

    this.#expect("]");

    switch (tagType){
      case TAG.BYTE_ARRAY: return this.#readByteArray(tags as ByteTag[]);
      case TAG.LIST: return tags as ListTag;
      case TAG.INT_ARRAY: return this.#readIntArray(tags as IntTag[]);
      case TAG.LONG_ARRAY: return this.#readLongArray(tags as LongTag[]);
    }
  }

  #readCompoundTag(): CompoundTag {
    this.#skipWhitespace();
    this.#expect("{");

    const tag: CompoundTag = {};

    while (this.#allocate(1) && this.#peek(0) !== "}"){
      this.#skipWhitespace();

      if (this.#peek(0) === "}") break;

      const key = this.#readString();

      if (key === null){
        throw new Error(`Unexpected character '${this.#peek(0)}' while expecting key-value pair or '}'`);
      }
      if (key === ""){
        throw new Error("Key cannot be empty");
      }

      this.#skipWhitespace();
      this.#expect(":");

      tag[key] = this.#readTag();

      if (!this.#skipSeperator()){
        if (this.#peek(0) !== "}"){
          throw new Error(`Unexpected character '${this.#peek(0)}' at end of tag`);
        }
        break;
      }
    }

    if (!this.#allocate(1)){
      throw new Error("Expected key-value pair or '}'");
    }

    this.#skip(1);

    return tag;
  }

  #readIntArray(entries: IntTag[]): IntArrayTag {
    const value = new Int32Array(entries.length);
    for (const i in entries){
      value[i] = entries[i].valueOf();
    }
    return value;
  }

  #readLongArray(entries: LongTag[]): LongArrayTag {
    const value = new BigInt64Array(entries.length);
    for (const i in entries){
      value[i] = entries[i];
    }
    return value;
  }
}