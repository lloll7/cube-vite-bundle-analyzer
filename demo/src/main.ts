import './style.css';
import logoUrl from './assets/logo.svg';
import mp4 from './assets/`.mp4';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
    app.innerHTML = `
        <img src="${logoUrl}" alt="logo" width="48" height="48" />
        <video src="${mp4}" controls width="320"></video>
        <h1>Bundle Analyzer Demo</h1>
        <p>运行 <code>npm run demo:build</code> 查看打包分析报告。</p>
    `;
}
