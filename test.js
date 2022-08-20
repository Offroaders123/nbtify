// @ts-check

import * as fs from "node:fs/promises";
import * as NBT from "./dist/index.js";

const data = await fs.readFile("../nbtest/nbt/bigtest.nbt").then(NBT.decompress);
// console.log(...data);

const reader = new NBT.Reader();

const result = reader.read(data);
console.log(result);

// const stringed = JSON.stringify(result);
// console.log(stringed);

// console.log(JSON.stringify(result,null,2));

// const cosa = new NBT.LongTag(128n);
// // cosa.value = "THIS IS WRONG :OO";
// console.log(cosa,cosa.valueOf());