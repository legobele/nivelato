// testing.js — watermark overlay for staging/testing builds
// Shows a diagonal "TESTING" watermark on non-production domains.
// Include this script on any page to auto-activate.

(function(){
  // Only show on non-production domains
  var host = window.location.hostname;
  if (host === 'legobele.github.io' || host === 'nivelato.app' || host === 'www.nivelato.app') return;
  if (host === 'nivelatolabs.com' || host.endsWith('.nivelatolabs.com')) return;

  if (document.getElementById('testing-watermark')) return;

  var w = window.innerWidth, h = window.innerHeight;
  var fontSize = Math.min(w, h) * 0.08;

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'testing-watermark');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:2147483647;pointer-events:none;';

  var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', '50%');
  text.setAttribute('y', '50%');
  text.setAttribute('transform', 'rotate(-28, ' + w/2 + ', ' + h/2 + ')');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('font-family', 'system-ui, sans-serif');
  text.setAttribute('font-size', fontSize);
  text.setAttribute('font-weight', '900');
  text.setAttribute('fill', 'rgba(220, 53, 69, 0.12)');
  text.setAttribute('stroke', 'rgba(220, 53, 69, 0.08)');
  text.setAttribute('stroke-width', '1');
  text.textContent = 'TESTING';

  svg.appendChild(text);
  document.body.appendChild(svg);

  window.addEventListener('resize', function() {
    var nw = window.innerWidth, nh = window.innerHeight;
    text.setAttribute('transform', 'rotate(-28, ' + nw/2 + ', ' + nh/2 + ')');
    text.setAttribute('font-size', Math.min(nw, nh) * 0.08);
  });
})();
