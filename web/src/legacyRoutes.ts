// Preserve policy links bookmarked before the public homepage was introduced.
if (location.hash === '#/terms' || location.hash === '#/privacy') {
  location.replace(`/app/${location.hash}`);
}
