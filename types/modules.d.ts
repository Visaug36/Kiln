/**
 * pdfmake ships no types for its prebuilt browser bundles. Only the handful of
 * calls Recast makes are declared, so a typo in one of them is still a type error
 * rather than silently `any`.
 */
declare module 'pdfmake/build/pdfmake' {
  interface PdfDocumentHandle {
    /** 0.3 returns a promise; the callback form belonged to 0.2. */
    getBuffer(): Promise<Uint8Array>;
    getBlob(): Promise<Blob>;
  }
  interface PdfMake {
    createPdf(documentDefinition: unknown): PdfDocumentHandle;
    addVirtualFileSystem(vfs: Record<string, unknown>): void;
    addFonts(fonts: Record<string, Record<string, string>>): void;
  }
  const pdfMake: PdfMake;
  export default pdfMake;
}

declare module 'pdfmake/build/fonts/Roboto' {
  /** `vfs` holds the four TTFs as base64; `fonts` names the family. */
  const fontContainer: {
    vfs: Record<string, unknown>;
    fonts: Record<string, Record<string, string>>;
  };
  export default fontContainer;
}
