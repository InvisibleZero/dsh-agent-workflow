// 开发用临时隧道：把 github.com:443 的 CONNECT 请求转发到一个可达的 GitHub IP。
//
// 背景：本机 DNS 把 github.com 解析到 20.205.243.166，该 IP 从当前网络不通（连接超时），
// 而 140.82.113.3 可达。git 没有可用的「按命令强制解析 IP」开关，所以用这个本地隧道绕过去。
//
// 用法：
//   node scripts/dev-github-tunnel.cjs            # 默认监听 127.0.0.1:8899
//   $env:GH_TUNNEL_PORT=8899; $env:GH_TUNNEL_IP=140.82.113.3
//   git -c http.proxy=http://127.0.0.1:8899 push origin main
//
// 只转发 github.com，api.github.com 等其它域名直连即可。用完 Ctrl+C 关掉。
const http = require('node:http');
const net = require('node:net');

const LISTEN_PORT = Number(process.env.GH_TUNNEL_PORT || 8899);
const FORWARD_IP = process.env.GH_TUNNEL_IP || '140.82.113.3';

const server = http.createServer((req, res) => {
  res.writeHead(400);
  res.end('CONNECT only');
});

server.on('connect', (req, clientSocket, head) => {
  const [targetHost, targetPortRaw] = String(req.url).split(':');
  const targetPort = Number(targetPortRaw || 443);
  const connectHost = targetHost === 'github.com' ? FORWARD_IP : targetHost;

  const upstream = net.connect(targetPort, connectHost, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length > 0) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });

  upstream.on('error', (error) => {
    console.error('[gh-tunnel] upstream error', targetHost, error.message);
    try { clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n'); } catch {}
    clientSocket.destroy();
  });
  clientSocket.on('error', () => upstream.destroy());
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log('[gh-tunnel] listening on 127.0.0.1:' + LISTEN_PORT + ' -> github.com via ' + FORWARD_IP);
});
