# Acceso publico a la app

La API y el frontend estan desplegados en la instancia EC2.

URL HTTP directa:

```text
http://32.192.205.218:8080
```

Esta URL sirve para probar la API, pero los navegadores modernos requieren HTTPS para usar camara y Web Serial fuera de `localhost`.

URL HTTPS actual mediante Cloudflare Tunnel:

```text
https://auction-olympus-ahead-merit.trycloudflare.com
```

Esta URL permite:

- abrir la app desde cualquier equipo,
- usar camara desde el navegador,
- usar Arduino por USB local en PCs con Chrome o Edge,
- hacer predicciones sin Arduino desde PCs o moviles.

## Limitacion de la URL trycloudflare

Es una URL temporal de prueba. Puede cambiar si se reinicia el tunel o la instancia.

Para ver la URL actual:

```bash
cat /home/ubuntu/cloudflared.log
```

Para reiniciar el tunel:

```bash
pkill -f "cloudflared tunnel"
nohup cloudflared tunnel --url http://127.0.0.1:8080 --no-autoupdate > /home/ubuntu/cloudflared.log 2>&1 &
sleep 10
cat /home/ubuntu/cloudflared.log
```

## Recomendacion estable

Para una URL fija conviene una de estas opciones:

1. Comprar o usar un dominio y configurar un Cloudflare Tunnel nombrado.
2. Abrir puertos 80 y 443 en el Security Group y usar Caddy o Nginx con HTTPS.
3. Publicar el frontend en S3 + CloudFront y dejar EC2 solo como API.

## Servicios en EC2

API:

```bash
sudo systemctl status semillas-api
sudo systemctl restart semillas-api
sudo journalctl -u semillas-api -f
```

Tunel HTTPS:

```bash
cat /home/ubuntu/cloudflared.log
```
