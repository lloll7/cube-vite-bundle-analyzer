// import './style.css';
// import logoUrl from './assets/logo.svg';
// import mp4 from './assets/testVideo.mp4';
// import testImg1 from './assets/testImg1.png';
// import testImg2 from './assets/nsprohome.png';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
    app.innerHTML = `
        <h1>Bundle Analyzer Demo</h1>
        <p>运行 <code>npm run demo:build</code> 查看打包分析报告。</p>
    `;
}
