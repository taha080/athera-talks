// Sets the saved theme before first paint so the page never flashes the
// wrong theme. Kept as a separate same-origin file (not inline) so the
// Content-Security-Policy in index.html can keep script-src 'self' with
// no 'unsafe-inline'. Only a hardcoded whitelist of theme names is ever
// applied; a stored value outside the list falls back to 'midnight'.
try {
  var themes = ['dark','naruto','midnight','sakura','ocean','forest','light','amoled','blush','lavender','peach','rosegold','cotton','mint','blossom','coquette']
  var savedTheme = localStorage.getItem('tatalk:theme')
  document.documentElement.setAttribute('data-theme', themes.indexOf(savedTheme) >= 0 ? savedTheme : 'midnight')
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'midnight')
}
