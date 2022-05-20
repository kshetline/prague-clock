(function () {
  // Test browser feature support.
  var script = document.currentScript || document.querySelector('script[data-bc-vers]');
  var args = script.getAttribute('data-bc-vers').split(',').map(function (arg) { return parseFloat(arg); });
  var msg = '';
  var features = {};

  (script.getAttribute('data-bc-features') || 'let,ds,arrow,symbol,arr_from,promise_f,sw')
    .split(',').forEach(function (f) { features[f] = true; });

  (function () {
    var ua = navigator.userAgent;
    var ieVersion = parseInt((/\bMSIE (\d+)/.exec(ua) || /\bWindows NT\b.+\brv:(\d+)/.exec(ua) || ['0', '0'])[1]);

    if (/\b(Firefox|Chrome)\b/.test(ua))
      ieVersion = 0;

    if (ieVersion && args[0] === 0) {
      msg = 'Internet Explorer is not supported';
      return;
    }
    else if (ieVersion && args[0] > 0 && ieVersion < args[0]) {
      msg = 'Your browser: ' + ua +
        '<br><br>\nInternet Explorer version must be ' + args[0] + ' or later';
      return;
    }

    var highlight = '<span style="font-weight: bold; color: magenta;">$1</span>';
    var chromeVersion = parseInt((/\bChrome\/(\d+)/.exec(ua) || ['0', '0'])[1]);

    if (chromeVersion && args[1] === 0) {
      msg = 'Chrome is not supported, nor related Chromium-derived browsers';
      return;
    }
    else if (chromeVersion && args[1] > 0 && chromeVersion < args[1]) {
      msg = 'Your browser: ' + ua.replace(/(\bChrome\/[.\d]+)/, highlight) +
        '<br><br>\nChrome version must be ' + args[1] + ' or later';
      return;
    }

    var firefoxVersion = parseInt((/\bFirefox\/(\d+)/.exec(ua) || ['0', '0'])[1]);

    if (firefoxVersion && args[2] === 0) {
      msg = 'Firefox is not supported';
      return;
    }
    else if (firefoxVersion && args[2] > 0 && firefoxVersion < args[2]) {
      msg = 'Your browser: ' + ua.replace(/(\bFirefox\/[.\d]+)/, highlight) +
        '<br><br>\nFirefox version must be ' + args[2] + ' or later';
      return;
    }

    var safariVersion = parseFloat((/\bVersion\/(\d+(\.\d+)?).*\bSafari\/\d+/.exec(ua) || ['0', '0'])[1]);

    if (safariVersion && args[3] === 0)
      msg = 'Safari is not supported';
    else if (safariVersion && args[3] > 0 && safariVersion < args[3])
      msg = 'Your browser: ' + ua.replace(/(\bVersion\/[.\d]+(.*\bSafari\b)?)/, highlight) +
        '<br><br>\nSafari version must be ' + args[3] + ' or later';
  })();

  if (!msg) {
    try {
      features.let && eval('let a = `a`');
      features.ds && eval('const [x, y] = [1, 2]');
      features.arrow && eval('(y = 0) => -y');
      features.symbol && eval('Symbol("symbol")');
      features.arr_from && eval('Array.from([])');
      features.promise && eval('new Promise(resolve => resolve()).catch()');
      features.promise_f && eval('new Promise(resolve => resolve()).finally()');
      msg = features.sw && !(''.startsWith) ? 'No String.startsWith()' : '';
    }
    catch (e) {
      msg = e.message || e.toString();
    }
  }

  if (msg) {
    alert('assets/incompatible.html?msg=' + encodeURIComponent(msg));
    location.href = 'assets/incompatible.html?msg=' + encodeURIComponent(msg);
    return;
  }

  // Handle forwarding of settings from old site.
  if (!location.search)
    return;

  let ls = (new URL(document.location)).searchParams.get('ls');

  if (ls) {
    try {
      JSON.parse(ls);
    }
    catch (e) {
      console.error(e);
      ls = '';
    }

    if (ls && !localStorage.getItem('pac-settings'))
      localStorage.setItem('pac-settings', ls);

    location.href = location.origin + location.pathname;
  }
})();
