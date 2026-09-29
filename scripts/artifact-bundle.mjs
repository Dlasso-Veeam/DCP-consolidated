// Bundles the prototype pages into self-contained single files for Artifact
// publishing: inlines the 3 local scripts, embeds the 6 local fonts as data
// URIs, and (pass 2) rewrites cross-page hrefs to artifact URLs from urls.json.
import fs from 'fs';
import path from 'path';
const SRC = '/Users/d.lasso/Desktop/data resilience';
const OUT = process.argv[2] || 'artifact-trial';
const PAGES = ['index.html', 'activity.html', 'inventory-V1.html', 'backup-policies.html'];
const urls = fs.existsSync(new URL('./artifact-urls.json', import.meta.url)) ? JSON.parse(fs.readFileSync(new URL('./artifact-urls.json', import.meta.url),'utf8')) : null;
const fontCache = {};
for (const page of PAGES) {
  let html = fs.readFileSync(path.join(SRC, page), 'utf8');
  // 1. inline local scripts (src without http/data)
  html = html.replace(/<script src="([^"]+?)(?:\?v=[^"]*)?"><\/script>/g, (m, src) => {
    if (/^https?:/.test(src)) return m;
    const js = fs.readFileSync(path.join(SRC, src), 'utf8');
    return '<script>/* inlined: ' + src + ' */\n' + js + '\n</script>';
  });
  // 2. embed local fonts
  html = html.replace(/url\('\.\/fonts\/([^']+)'\)/g, (m, f) => {
    if (!fontCache[f]) fontCache[f] = fs.readFileSync(path.join(SRC, 'fonts', f)).toString('base64');
    return "url('data:font/otf;base64," + fontCache[f] + "')";
  });
  // 2b. embed local images referenced from CSS url() or src (png/webp/svg/jpg
  // at the project root — Content-cropped.png on the splash was missed by the
  // font-only pass; user caught it 2026-09-08).
  html = html.replace(/url\('((?:\.\/)?[^'\/]+\.(png|webp|jpg|jpeg|svg))'\)/g, (m, f, ext) => {
    const fp = path.join(SRC, f.replace(/^\.\//,''));
    if (!fs.existsSync(fp)) return m;
    const mime = ext === 'svg' ? 'image/svg+xml' : 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
    return "url('data:" + mime + ";base64," + fs.readFileSync(fp).toString('base64') + "')";
  });
  html = html.replace(/src="((?:\.\/)?[^"\/]+\.(png|webp|jpg|jpeg))"/g, (m, f, ext) => {
    const fp = path.join(SRC, f.replace(/^\.\//,''));
    if (!fs.existsSync(fp)) return m;
    return 'src="data:image/' + (ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + fs.readFileSync(fp).toString('base64') + '"';
  });
  // 3. strip the password gate (artifact bundles only — claude.ai org auth
  // replaces the shared-secret overlay; the source files keep it for Netlify).
  html = html.replace('const AUTH_ENABLED = true;', 'const AUTH_ENABLED = false; /* artifact bundle: org auth replaces the gate */');
  // 4. pass 2 only: rewrite cross-page links
  if (urls) {
    // Rewrite every quoted reference to a trial page — static href="...",
    // JS rail objects (href: '...'), and location.href assignments — with the
    // optional #hash preserved. Refs outside the trial set (../, legacy
    // designs/) are left untouched: they're dead on the live server too.
    html = html.replace(/(["'])(index|activity|inventory-V1|backup-policies)\.html(#[^"']*)?\1/g, (m, q, name, hash) => {
      const url = urls[name + '.html'];
      return url ? q + url + (hash || '') + q : m;
    });
    // the picker-variant page isn't in the trial set — point at the main inventory
    if (urls['inventory-V1.html']) html = html.split('href="inventory-V1-picker.html"').join('href="' + urls['inventory-V1.html'] + '"');
    // The artifact sandbox blocks in-place navigation to another URL, so
    // cross-artifact links must open a NEW TAB. Two mechanisms:
    // (a) JS navigation: location.href = '<artifact url>' → window.open(...)
    html = html.replace(/(?:window\.)?location\.href\s*=\s*'(https:\/\/claude\.ai\/code\/artifact\/[^']*)'/g, "window.open('$1','_blank')");
    // (b) anchor clicks: a capture-phase shim — cross-artifact hrefs open in a
    // new tab; a link to THIS page's own artifact (e.g. activity.html#audit
    // from inside Activity) resolves to a local hash change instead.
    const selfUrl = urls[page] || '';
    const shim = '<script>/* artifact-bundle nav shim */(function(){var SELF=' + JSON.stringify(selfUrl) + ';document.addEventListener("click",function(e){var t=e.target;while(t&&t.tagName!=="A")t=t.parentElement;if(!t)return;var h=t.getAttribute("href")||"";if(h.indexOf("https://claude.ai/code/artifact/")!==0)return;e.preventDefault();var base=h.split("#")[0];if(base===SELF){var hash=h.split("#")[1];if(hash!=null)location.hash=hash;return;}window.open(h,"_blank","noopener");},true);})();</' + 'script>';
    html = html.replace('</body>', shim + '</body>');
  }
  fs.writeFileSync(path.join(OUT, page), html);
  const kb = Math.round(fs.statSync(path.join(OUT, page)).size / 1024);
  console.log(page, kb + 'KB', urls ? '(links rewritten)' : '(pass 1)');
}
