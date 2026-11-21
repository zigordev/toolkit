const attribution = /co-authored-by:|generated with \[?claude|claude\.com\/claude-code|🤖/i;

function noAttribution(commit) {
  return [
    !attribution.test(commit.raw),
    'remove attribution lines such as Co-Authored-By trailers or lines crediting Claude',
  ];
}

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [{ rules: { 'no-attribution': noAttribution } }],
  rules: {
    'no-attribution': [2, 'always'],
  },
};
