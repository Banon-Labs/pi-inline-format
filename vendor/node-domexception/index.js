"use strict";

const DOMExceptionImpl = globalThis.DOMException;

if (typeof DOMExceptionImpl !== "function") {
  throw new Error("Global DOMException is not available in this Node runtime.");
}

module.exports = DOMExceptionImpl;
module.exports.default = DOMExceptionImpl;
