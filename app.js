const https = require('https');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ProgressBar = require('progress');
const readline = require('readline');

const outputDirectory = './downloads';
if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
}

function promptForVideoUrl() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('Enter the m3u8 video URL: ', (videoUrl) => {
            rl.close();
            resolve(videoUrl);
        });
    });
}

function fetchM3u8File(videoUrl) {
    return new Promise((resolve, reject) => {
        https.get(videoUrl, (response) => {
            let data = '';
            response.on('data', (chunk) => (data += chunk));
            response.on('end', () => resolve(data));
            response.on('error', (error) => reject(error));
        });
    });
}

function extractTsUrls(m3u8Content, videoUrl) {
    const lines = m3u8Content.split('\n');
    const tsUrls = [];
    for (const line of lines) {
        if (!line.startsWith('#')) {
            const tsUrl = new URL(line, videoUrl).href;
            tsUrls.push(tsUrl);
        }
    }
    return tsUrls;
}

async function downloadTsSegments(tsUrls) {
    const tsFiles = [];
    const progressBar = new ProgressBar('Downloading [:bar] :percent :etas', {
        total: tsUrls.length,
        width: 40
    });

    const downloadPromises = tsUrls.map((tsUrl, index) => {
        return new Promise((resolve, reject) => {
            const tsFilePath = path.join(outputDirectory, `segment_${index}.ts`);
            const writer = fs.createWriteStream(tsFilePath);

            axios({
                method: 'get',
                url: tsUrl,
                responseType: 'stream'
            })
                .then((response) => {
                    response.data.pipe(writer);
                    writer.on('finish', () => {
                        tsFiles.push(tsFilePath);
                        progressBar.tick();
                        resolve();
                    });
                })
                .catch((error) => {
                    reject(error);
                });
        });
    });

    try {
        await Promise.all(downloadPromises);
        return tsFiles;
    } catch (error) {
        console.error('Error downloading TS segments:', error);
        process.exit(1);
    }
}

function mergeTsSegments(tsFiles, outputFilePath) {
    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outputFilePath);
        let count = 0;

        const progressBar = new ProgressBar('Merging [:bar] :percent :etas', {
            total: tsFiles.length,
            width: 40
        });

        const mergeNextSegment = () => {
            if (count < tsFiles.length) {
                const reader = fs.createReadStream(tsFiles[count]);
                reader.pipe(writer, { end: false });
                reader.on('end', () => {
                    count++;
                    progressBar.tick();
                    mergeNextSegment();
                });
                reader.on('error', (error) => {
                    reject(error);
                });
            } else {
                writer.end();
                writer.on('finish', () => resolve());
            }
        };

        mergeNextSegment();
    });
}

function cleanupTsFiles(tsFiles) {
    tsFiles.forEach((file) => {
        try {
            fs.unlinkSync(file);
        } catch (error) {
            console.error(`Error deleting file ${file}:`, error);
        }
    });
}

async function main() {
    try {
        console.log('Pornhub/m3u8 Video Downloader');
        console.log('====================================');
        console.log('A tool to download videos using streaming links');
        console.log('Optimized for Pornhub links');
        console.log('QQ Group: 940994905');
        console.log('By MengZe2 (@YShenZe)');
        console.log('====================================');

        const videoUrl = await promptForVideoUrl();
        if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
            throw new Error('Invalid URL. Please enter a URL starting with http:// or https://');
        }

        console.log('Downloading m3u8 file...');
        const m3u8Content = await fetchM3u8File(videoUrl);
        console.log('Parsing m3u8 file...');
        const tsUrls = extractTsUrls(m3u8Content, videoUrl);
        console.log(`Found ${tsUrls.length} TS segments.`);

        console.log('Downloading TS segments...');
        const tsFiles = await downloadTsSegments(tsUrls);

        const videoId = videoUrl.split('/').filter(Boolean).pop().split('.')[0];
        const outputFilePath = path.join(outputDirectory, `${videoId}.mp4`);
        console.log('Merging TS segments...');
        await mergeTsSegments(tsFiles, outputFilePath);

        console.log('Cleaning up TS files...');
        cleanupTsFiles(tsFiles);

        console.log(`Download completed! File saved to: ${outputFilePath}`);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
