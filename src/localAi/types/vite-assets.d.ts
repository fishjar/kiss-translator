declare module "*?url" {
  const src: string;
  export default src;
}

declare module "*?worker" {
  const workerConstructor: new (options?: { type?: string }) => Worker;
  export default workerConstructor;
}
