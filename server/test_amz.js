const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const amazonUrl = `https://www.amazon.in/s?k=good+knight`;
        const response = await axios.get(amazonUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        });
        const $ = cheerio.load(response.data);
        const images = [];
        $('.s-image').each((i, el) => {
            const src = $(el).attr('src');
            if (src && src.startsWith('https://m.media-amazon.com/images/I/')) {
                const highRes = src.replace(/\._AC_[a-zA-Z0-9_,]*_\./, '.');
                images.push(highRes);
            } else if (src) {
                console.log('Rejected src:', src);
            }
        });
        console.log('Images found:', images.length);
        console.log(images.slice(0, 3));
    } catch(err) {
        console.log(err.message);
    }
}
test();
