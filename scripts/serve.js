const http=require('http'),fs=require('fs'),path=require('path');
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.csv':'text/csv'};
http.createServer((req,res)=>{
  const p=path.join(__dirname,decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p,(e,d)=>{
    if(e){res.writeHead(404);res.end('not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(p)]||'text/plain'});
    res.end(d);
  });
}).listen(8731,()=>console.log('serving on http://localhost:8731'));
