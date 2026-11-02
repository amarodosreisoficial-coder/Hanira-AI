/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'pdfmake/build/pdfmake' {
  const pdfMake: {
    vfs: any;
    addVirtualFileSystem(vfs: any): void;
    createPdf(docDefinition: any): {
      getBlob(callback: (blob: Blob) => void): void;
      getBuffer(callback: (buffer: Buffer) => void): void;
      getStream(callback: (stream: any) => void): void;
    };
  };
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
  const vfs: any;
  export default vfs;
}
