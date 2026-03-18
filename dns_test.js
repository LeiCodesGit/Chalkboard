import dns from 'dns';

dns.resolveSrv('_mongodb._tcp.cluster0.oieaa2c.mongodb.net', (err, addresses) => {
    if (err) {
        console.error("DNS Srv Error:", err.message);
        console.log("Using Google DNS as fallback...");
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        dns.resolveSrv('_mongodb._tcp.cluster0.oieaa2c.mongodb.net', (err2, addr2) => {
             if(err2) console.error("Still error", err2);
             else console.log("Addresses:", addr2);
        });
    } else {
        console.log("Addresses:", addresses);
    }
});
