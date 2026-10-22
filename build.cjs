// Only the browser game and its artwork belong in the public website artifact.
const fs = require('node:fs');
const path = require('node:path');
const files = ['index.html', 'styles.css', 'icons.js', 'data.js', 'engine.js', 'app.js',
  'assets/campus-v2.png', 'assets/study-v2.png', '.nojekyll'];
for (const file of files) {
  const source = path.join(__dirname, file);
  const destination = path.join(__dirname, 'dist', file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}
console.log(`已生成网页发布包：dist/（${files.length} 个文件）`);
