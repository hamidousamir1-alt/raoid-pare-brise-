import TourPlanner from "./TourPlanner";
export default function Terrain() {
  return (
    <main className="workspace terrainPage">
      <style>{`.moduleTitle{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:22px}.moduleTitle h1{margin:4px 0 7px}.moduleTitle>div>p:not(.eyebrow){margin:0;color:#778497;font-size:12px}.terrainLive{display:flex;align-items:center;gap:9px;padding:9px 12px;background:#fff;border:1px solid #e3e8ed;border-radius:12px}.terrainLive>i{width:8px;height:8px;background:#ef3340;border-radius:50%;box-shadow:0 0 0 5px rgba(239,51,64,.1)}.terrainLive small,.terrainLive b{display:block}.terrainLive small{font-size:6px;letter-spacing:1px;color:#8b96a5}.terrainLive b{font-size:10px;margin-top:2px}.terrainPage .strategy{position:relative;overflow:hidden;align-items:center;background:linear-gradient(120deg,#07111f,#102031 72%,#241117);border-radius:22px;padding:30px 32px}.terrainPage .strategy:after{content:"";position:absolute;width:190px;height:190px;border-radius:50%;border:1px solid rgba(239,51,64,.22);right:-75px;top:-105px}.terrainPage .strategy h2{font-size:27px;margin:5px 0}.terrainPage .strategy>div>p:not(.eyebrow){font-size:10px;color:#9aa7b7}.terrainPage .strategyStats{position:relative;z-index:1;gap:10px}.terrainPage .strategyStats>b{min-width:92px;padding:13px 15px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08);border-radius:13px;font-size:18px}.terrainPage .strategyStats small{display:block;font-family:var(--font-body);font-size:6px;letter-spacing:.8px;color:#8492a5;margin-top:4px}.terrainPage .plannerbar{display:flex;align-items:center;gap:9px;border-radius:13px;padding:10px 13px;box-shadow:0 4px 14px rgba(16,24,40,.035);font-size:9px;color:#687587}.terrainPage .plannerbar button{width:27px;height:27px;border:1px solid #e1e6eb;background:#f6f8fa;border-radius:8px}.terrainPage .plannerbar .auto{margin-left:auto;color:#bf2934;background:#fff0f1;padding:6px 9px;border-radius:8px}.terrainPage .terrainGrid{grid-template-columns:1.15fr .85fr;gap:14px}.terrainPage .terrainGrid>.panel{border-radius:17px}.terrainPage .stop{grid-template-columns:36px 1fr 36px 28px;align-items:center;padding:16px 0}.terrainPage .stopnum{background:#111c2a;border-radius:11px;font-size:10px}.terrainPage .stop h3{font-size:12px;margin:0 0 4px}.terrainPage .stop p{font-size:9px;color:#7e8a99}.terrainPage .stopchips{display:flex;gap:5px;flex-wrap:wrap;margin:8px 0}.terrainPage .stopchips small{background:#f4f6f8;color:#667487;border-radius:7px;padding:5px 6px;font-size:7px}.terrainPage .navlinks a{background:#111c2a;border-radius:7px;font-size:7px;padding:6px 8px}.terrainPage .stop>button{border:0;background:#f3f5f7;color:#8490a0;width:25px;height:25px;border-radius:8px}.terrainPage .mapfake{background:linear-gradient(145deg,#e9edf1,#dfe5ea);border:1px solid #dde3e8;box-shadow:0 8px 24px rgba(16,24,40,.07)}.terrainPage .mapgrid{opacity:.65}.terrainPage .route{position:absolute;left:50%;top:15%;display:flex;flex-direction:column;align-items:center;color:#ef3340;font-size:15px}.terrainPage .route span{display:flex;flex-direction:column;align-items:center}.terrainPage .route i{display:block;width:2px;height:50px;background:#ef3340;opacity:.5}.terrainPage .maplabel{background:rgba(7,17,31,.92);border:1px solid rgba(255,255,255,.08);padding:14px;font-size:9px;line-height:1.55}.terrainPage .logic{display:grid;grid-template-columns:1fr 1.4fr;gap:20px;align-items:center}.terrainPage .logicgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.terrainPage .logicgrid p{background:#f5f7f9;border-radius:10px;padding:10px;font-size:8px}.terrainPage .logicgrid b{display:block;color:#ef3340;font-size:15px}.terrainPage .logic>small{grid-column:1/-1;color:#8b96a4;font-size:8px}@media(max-width:950px){.terrainPage .terrainGrid,.terrainPage .logic{grid-template-columns:1fr}.terrainPage .strategy{display:block}.terrainPage .strategyStats{margin-top:18px}.terrainLive{display:none}}`}</style>
      <div className="moduleTitle terrainTitle">
        <div>
          <p className="eyebrow">MODE TERRAIN · COPILOTE</p>
          <h1>La bonne zone. Les bons prospects.</h1>
          <p>
            Transformez la base CRM en tournée commerciale claire, concentrée et
            directement exploitable sur le terrain.
          </p>
        </div>
        <div className="terrainLive">
          <i />
          <span>
            <small>MODE TERRAIN</small>
            <b>Prêt à partir</b>
          </span>
        </div>
      </div>
      <TourPlanner />
    </main>
  );
}
