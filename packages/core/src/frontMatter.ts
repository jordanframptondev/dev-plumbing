import matter from 'gray-matter';

/** Thrown when a file's front matter is in a language we refuse to run, such as JavaScript. */
export class UnsafeFrontMatterError extends Error {}

const refuse = (): never => {
  throw new UnsafeFrontMatterError('JavaScript front matter is not allowed. Use a YAML header between --- lines.');
};

/**
 * The only way this codebase reads front matter. gray-matter's default engines `eval` a `---js` header,
 * so the JavaScript engines are replaced with one that refuses. Passing options also turns off
 * gray-matter's unbounded cache.
 */
export function parseFrontMatter(text: string): matter.GrayMatterFile<string> {
  return matter(text, { engines: { javascript: refuse, js: refuse } });
}
