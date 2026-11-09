import { PDFJS } from "./pdfDocument";

// pdf_viewer.mjs 在模块求值时读取 globalThis.pdfjsLib，本模块必须先于它导入。
globalThis.pdfjsLib = PDFJS;
