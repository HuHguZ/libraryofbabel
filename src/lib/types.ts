export interface BabelConfig {
  lengthOfPage: number;
  lengthOfTitle: number;
  digs: string;
  alphabet: string;
  wall: number;
  shelf: number;
  volume: number;
  page: number;
}

export interface SearchResult {
  address: string;
}

export interface PageResult {
  content: string;
  wall: number;
  shelf: number;
  volume: number;
  page: number;
}

export interface TitleResult {
  title: string;
}

export interface BabelLibrary {
  config: BabelConfig;
  search(text: string): string;
  searchExactly(text: string): string;
  searchTitle(title: string): string;
  getPage(address: string): string;
  getTitle(address: string): string;
}
