/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'pdfmake/build/pdfmake' {
  const pdfMake: {
    vfs: any;
    addVirtualFileSystem(vfs: any): void;
    createPdf(docDefinition: any): {
      getBlob(): Promise<Blob>;
      getBuffer(): Promise<Buffer>;
      getStream(): Promise<any>;
      getDataUrl(): Promise<string>;
    };
  };
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
  const vfs: any;
  export default vfs;
}
