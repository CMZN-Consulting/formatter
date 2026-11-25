export interface Source {
  readonly path: string;
  readonly absolute: string;
}

export interface Backend {
  readonly name: string;
  readonly version: string;
  claims(source: Source): Promise<boolean>;
  format(text: string, source: Source): Promise<string>;
}
