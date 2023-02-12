import { NBTData } from "./data.js";
import { Tag, ByteTag, BooleanTag, ShortTag, IntTag, LongTag, FloatTag, DoubleTag, ByteArrayTag, StringTag, ListTag, CompoundTag, IntArrayTag, LongArrayTag, TAG, getTagType } from "./tag.js";

export function stringify(data: CompoundTag | NBTData, space: string | number = ""){
  if (data instanceof NBTData){
    data = data.data as CompoundTag;
  }
  const writer = new SNBTWriter();
  return writer.write(data,space);
}

export class SNBTWriter {
  #space!: string;
  #level!: number;

  write(data: CompoundTag | NBTData, space: string | number = "") {
    if (data instanceof NBTData){
      data = data.data as CompoundTag;
    }

    this.#space = (typeof space === "number") ? " ".repeat(space) : space;
    this.#level = 1;

    return this.#writeTag(data);
  }

  #writeTag(value: Tag): string {
    const type = getTagType(value);
    switch (type){
      case TAG.BYTE: return (typeof value === "boolean") ? this.#writeBoolean(value as boolean) : this.#writeByte((value as ByteTag).valueOf());
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
      default: throw new Error("Invalid tag");
    }
  }

  #writeBoolean(value: boolean) {
    return `${value}`;
  }

  #writeByte(value: number) {
    return `${value}b`;
  }

  #writeShort(value: number) {
    return `${value}s`;
  }

  #writeInt(value: number) {
    return `${value}`;
  }

  #writeLong(value: bigint) {
    return `${value}l`;
  }

  #writeFloat(value: number) {
    return `${value}f`;
  }

  #writeDouble(value: number) {
    return `${value}d`;
  }

  #writeByteArray(value: Int8Array) {
    return `[B;${[...value].map(entry => this.#writeByte(entry)).join() as string}]`;
  }

  #writeString(value: string) {
    const singleQuoteString = value.replace(/['\\]/g,(character) => `\\${character}`);
    const doubleQuoteString = value.replace(/["\\]/g,(character) => `\\${character}`);
    return (singleQuoteString.length < doubleQuoteString.length) ? `'${singleQuoteString}'` : `"${doubleQuoteString}"`;
  }

  #writeList(value: ListTag) {
    const fancy = (this.#space !== "");
    value = value.filter((entry): entry is Tag => getTagType(entry) !== null);
    const type = (value.length !== 0) ? getTagType(value[0])! : TAG.END;
    const isIndentedList = fancy && new Set<TAG>([TAG.BYTE_ARRAY,TAG.LIST,TAG.COMPOUND,TAG.INT_ARRAY,TAG.LONG_ARRAY]).has(type);
    return `[${value.map(entry => `${isIndentedList ? `\n${this.#space.repeat(this.#level)}` : ""}${(() => {
      this.#level += 1;
      const result = this.#writeTag(entry);
      this.#level -= 1;
      return result;
    })() as string}`).join(`,${fancy && !isIndentedList ? " " : ""}`)}${isIndentedList ? `\n${this.#space.repeat(this.#level - 1)}` : ""}]`;
  }

  #writeCompound(value: CompoundTag) {
    const fancy = (this.#space !== "");
    return `{${[...Object.entries(value)].map(([key,value]) => `${fancy ? `\n${(this.#space as string).repeat(this.#level)}` : ""}${/^[0-9a-z_\-.+]+$/i.test(key) ? key : this.#writeString(key)}:${fancy ? " " : ""}${(() => {
      this.#level += 1;
      const result = this.#writeTag(value);
      this.#level -= 1;
      return result;
    })() as string}`).join(",")}${fancy && Object.keys(value).length !== 0 ? `\n${this.#space.repeat(this.#level - 1)}` : ""}}`;
  }

  #writeIntArray(value: Int32Array) {
    return `[I;${[...value].map(entry => this.#writeInt(entry)).join() as string}]`;
  }

  #writeLongArray(value: BigInt64Array) {
    return `[L;${[...value].map(entry => this.#writeLong(entry)).join() as string}]`;
  }
}