import { NBTData } from "./data.js";
import { Tag, ByteTag, BooleanTag, ShortTag, IntTag, LongTag, FloatTag, DoubleTag, ByteArrayTag, StringTag, ListTag, CompoundTag, IntArrayTag, LongArrayTag, TAG, getTagType } from "./tag.js";
import { Byte, Short, Int, Float } from "./primitive.js";

const WHITESPACE_PATTERN = /\s+/;
const UNQUOTED_STRING_PATTERN = /^[0-9a-z_\-.+]+$/i;
const UNQUOTED_STRING_OPEN_PATTERN = /^[0-9a-z_\-.+]+/i;
const INTEGER_PATTERN = /^([-+]?(?:0|[1-9][0-9]*))([bls]?)$/i;
const FLOAT_PATTERN = /^([-+]?(?:[0-9]+[.]?|[0-9]*[.][0-9]+)(?:e[-+]?[0-9]+)?)([df]?)$/i;
const TRUE_PATTERN = /^true$/i;
const FALSE_PATTERN = /^false$/i;

export function stringify(value: Tag, space: string | number = "", level = 1): string {
  space = (typeof space === "number") ? "".padStart(space," ") : space;
  const fancy = (space !== "");

  const type = getTagType(value);
  switch (type){
    case TAG.BYTE: return (typeof value === "boolean") ? `${value}` : `${value as ByteTag}b`;
    case TAG.SHORT: return `${value as ShortTag}s`;
    case TAG.INT: return `${value as IntTag}`;
    case TAG.LONG: return `${value as LongTag}l`;
    case TAG.FLOAT: return `${value as FloatTag}f`;
    case TAG.DOUBLE: return `${value as DoubleTag}d`;
    case TAG.BYTE_ARRAY: return `[B;${stringifyList([...value as ByteArrayTag].map(entry => new Byte(entry)),space,level)}]`;
    case TAG.STRING: return escapeWithQuotes(value as StringTag);
    case TAG.LIST: return `[${stringifyList(value as ListTag,space,level)}]`;
    case TAG.COMPOUND: {
      return `{${[...Object.entries(value as CompoundTag)].map(([key,value]) => `${fancy ? `\n${"".padStart((space as string).length * level,space as string)}` : ""}${stringifyKey(key)}:${fancy ? " " : ""}${stringify(value,space,level + 1)}`).join(",")}${fancy && Object.keys(value).length !== 0 ? `\n${"".padStart(space.length * (level - 1),space)}` : ""}}`;
    }
    case TAG.INT_ARRAY: return `[I;${stringifyList([...value as IntArrayTag].map(entry => new Int(entry)),space,level)}]`;
    case TAG.LONG_ARRAY: return `[L;${stringifyList([...value as LongArrayTag] as LongTag[],space,level)}]`;
    default: throw new Error("Invalid tag");
  }
}

export function parse(text: string): Tag {
  const parser = new TagParser(text);
  return parser.parseTag();
}

function stringifyList(list: Tag[], space: string, level: number) {
  const [template] = list;
  const type = getTagType(template) as TAG;
  const fancy = (space !== "" && list.length !== 0 && new Set<TAG>([TAG.BYTE_ARRAY,TAG.LIST,TAG.COMPOUND,TAG.INT_ARRAY,TAG.LONG_ARRAY]).has(type));
  return `${list.map((tag) => `${fancy ? `\n${"".padStart(space.length * level,space)}` : ""}${stringify(tag,space,level + 1)}`).join(",")}${fancy ? `\n${"".padStart(space.length * (level - 1),space)}` : ""}`;
}

function stringifyKey(key: string) {
  return UNQUOTED_STRING_PATTERN.test(key) ? key : escapeWithQuotes(key);
}

const SINGLE_QUOTE_ESCAPE_PATTERN = /['\\]/g;
const DOUBLE_QUOTE_ESCAPE_PATTERN = /["\\]/g;

function escapeWithQuotes(text: string) {
  const singleQuoteString = text.replace(SINGLE_QUOTE_ESCAPE_PATTERN, escapeChar);
  const doubleQuoteString = text.replace(DOUBLE_QUOTE_ESCAPE_PATTERN, escapeChar);
  return (singleQuoteString.length < doubleQuoteString.length) ? `'${singleQuoteString}'` : `"${doubleQuoteString}"`;
}

function escapeChar(char: string) {
  return `\\${char}`;
}

class TagParser {
  #text: string;
  #pos = 0;

  constructor(text: string) {
    this.#text = text;
  }

  parseTag(): Tag {
    const tag = this.#readTag();
    const lastChar = this.#peek(-1);

    const endPos = this.#pos;
    this.#skipWhitespace();

    if (this.#canRead()) {
      const type = getTagType(tag);
      if (this.#pos > endPos || type === TAG.LIST || type === TAG.COMPOUND || lastChar == "'" || lastChar == '"'){
        throw new Error("Unexpected non-whitespace character after tag");
      }
      throw new Error(`Unexpected character '${this.#peek()}' at end of tag`);
    }
    return tag;
  }

  #readTag(): Tag {
    this.#skipWhitespace();

    if (!this.#canRead()){
      throw new Error("Expected tag");
    }

    const char = this.#text[this.#pos];
    if (char == "{") return this.#readCompoundTag();
    if (char == "[") return this.#readList();
    if (char == '"' || char == "'") {
      return this.#readQuotedString(char) as StringTag;
    }

    const string = this.#readUnquotedString();
    if (string == null) {
      throw new Error(`Unexpected character '${char}' while reading tag`);
    }

    try {
      let match = string.match(INTEGER_PATTERN);
      if (match) {
        const c = match[2];
        if (c == "b" || c == "B") {
          return new Byte(Number(match[1]));
        } else if (c == "s" || c == "S") {
          return new Short(Number(match[1]));
        } else if (c == "l" || c == "L") {
          return BigInt(match[1]) as LongTag;
        } else {
          return new Int(Number(match[1]));
        }
      }

      match = string.match(FLOAT_PATTERN);
      if (match) {
        if (match[2] == "f" || match[2] == "F") {
          return new Float(Number(match[1]));
        }
        return Number(match[1]) as DoubleTag;
      }

      if (TRUE_PATTERN.test(string) || FALSE_PATTERN.test(string)) return Boolean(string);
    } catch {
      return string as StringTag;
    }
    return string as StringTag;
  }

  #readCompoundTag() {
    this.#skipWhitespace();
    this.#expect("{");
    const tag: CompoundTag = {};
    while (this.#canRead() && this.#peek() != "}") {
      this.#skipWhitespace();
      if (this.#peek() === "}"){
        break;
      }

      const key = this.#readString();
      if (key == null) {
        throw new Error(`Unexpected character '${this.#peek()}' while expecting key-value pair or '}'`);
      }
      if (key == ""){
        throw new Error("Key cannot be empty");
      }

      this.#skipWhitespace();
      this.#expect(":");
      tag[key] = this.#readTag();

      if (!this.#skipSeperator()) {
        if (this.#peek() != "}") {
          throw new Error(`Unexpected character '${this.#peek()}' at end of tag`);
        }
        break;
      }
    }
    if (!this.#canRead()){
      throw new Error("Expected key-value pair or '}'");
    }
    this.#skip();
    return tag;
  }

  #readList(): Tag {
    this.#expect("[");

    // deno-lint-ignore ban-types
    let tagType: TAG | undefined;
    let isArray = false;

    if (this.#canRead(2) && this.#peek(1) == ";") {
      const char = this.#peek();
      if (char == "B") {
        tagType = TAG.BYTE;
      } else if (char == "I") {
        tagType = TAG.INT;
      } else if (char == "L") {
        tagType = TAG.LONG;
      } else {
        throw new Error(`Invalid array type '${char}'`);
      }
      isArray = true;
      this.#skip(2);
    }

    this.#skipWhitespace();
    const tags: Tag[] = [];

    while (this.#canRead() && this.#peek() != "]") {
      const tag = this.#readTag();

      // if (tagType == null) {
      //   tagType = tag.constructor;
      // } else if (!(tag instanceof tagType)) {
      //   throw new Error(
      //     `Expected tag of type ${tagType.name} but got ${tag.constructor}`,
      //   );
      // }

      tags.push(tag);

      if (!this.#skipSeperator()) {
        if (this.#peek() != "]") {
          throw new Error(`Unexpected character '${this.#peek()}' at end of tag`);
        }
        break;
      }
    }

    if (!this.#canRead()){
      throw Error("Expected tag or ']'");
    }
    this.#expect("]");

    if (isArray) {
      if (tagType == TAG.BYTE) {
        const array = new Int8Array(tags.length);
        for (let i = 0; i < tags.length; i++) {
          array[i] = tags[i].valueOf() as number;
        }
        return array as ByteArrayTag;
      }
      if (tagType == TAG.INT) {
        const array = new Int32Array(tags.length);
        for (let i = 0; i < tags.length; i++) {
          array[i] = tags[i].valueOf() as number;
        }
        return array as IntArrayTag;
      }
      if (tagType == TAG.LONG) {
        const array = new BigInt64Array(tags.length);
        for (let i = 0; i < tags.length; i++) {
          array[i] = tags[i].valueOf() as bigint;
        }
        return array as LongArrayTag;
      }
    }

    return tags as ListTag;
  }

  #readString() {
    const char = this.#peek();
    return (char == '"' || char == "'") ? this.#readQuotedString(char) : this.#readUnquotedString();
  }

  #readUnquotedString() {
    const match = this.#text.slice(this.#pos).match(UNQUOTED_STRING_OPEN_PATTERN);
    if (!match) return null;

    this.#pos += match[0].length;
    return match[0];
  }

  #readQuotedString(quoteChar: string) {
    let lastPos = ++this.#pos;
    let string = "";

    while (this.#canRead()) {
      const char = this.#next();
      if (char == "\\") {
        if (!this.#canRead()) {
          throw new Error("Unexpected end while reading escape sequence");
        }
        const escapeChar = this.#peek();
        if (escapeChar != quoteChar && escapeChar != "\\") {
          throw new Error(`Invalid escape character '${escapeChar}'`);
        }
        string += this.#text.slice(lastPos, this.#pos - 1) + escapeChar;
        lastPos = ++this.#pos;
      } else if (char == quoteChar) {
        return string + this.#text.slice(lastPos, this.#pos - 1);
      }
    }
    throw new Error(`Missing end quote`);
  }

  #canRead(len = 1) {
    return this.#pos + len <= this.#text.length;
  }

  #peek(off = 0) {
    return this.#text[this.#pos + off];
  }

  #next() {
    return this.#text[this.#pos++];
  }

  #skip(len = 1) {
    this.#pos += len;
  }

  #skipSeperator() {
    this.#skipWhitespace();
    if (this.#canRead() && this.#peek() == ",") {
      this.#skip();
      this.#skipWhitespace();
      return true;
    } else {
      return false;
    }
  }

  #skipWhitespace() {
    while (this.#canRead() && WHITESPACE_PATTERN.test(this.#peek())) {
      this.#skip();
    }
  }
  #expect(char: string) {
    if (!this.#canRead() || this.#peek() != char) {
      throw new Error(`Expected '${char}'`);
    }
    this.#pos += 1;
  }
}