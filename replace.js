const fs = require('fs');
const path = require('path');

const excludeDirs = ['node_modules', '.next', '.git', '.cache'];
const extList = ['.ts', '.tsx', '.css', '.md'];

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            if (!excludeDirs.includes(file)) {
                results = results.concat(walk(filePath));
            }
        } else {
            if (extList.includes(path.extname(file)) || file === 'package.json') {
                results.push(filePath);
            }
        }
    });
    return results;
}

const files = walk(process.cwd());

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Replace variants
    content = content.replace(/GyanSarthi \([^)]+\)/g, 'Drona AI'); // For "GyanSarthi (ज्ञानसारथी)"
    content = content.replace(/GyanSarthi/gi, (match) => {
        if (match === 'GyanSarthi') return 'Drona AI';
        if (match === 'gyansarthi') return 'drona-ai';
        return 'Drona AI';
    });

    // specifically handle the domains
    content = content.replace(/drona-ai\.edu/g, 'drona.edu');

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated ${file}`);
    }
});
