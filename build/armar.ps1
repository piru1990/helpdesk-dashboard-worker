# Arma public/ a partir de la página del tablero (page/index.html + page/app.js) y copia d3.
# Uso: pwsh build\armar.ps1
$raiz = Split-Path $PSScriptRoot -Parent
$pagina = Get-Content "$raiz\page\index.html" -Raw
$pagina = $pagina -replace '<meta name="dash-one-writer">\s*', '' -replace '<script src="app.js"></script>\s*$', ''
$pagina = $pagina.Replace('creados desde mayo de 2026. Las fechas', 'creados en los últimos seis meses. Las fechas')
$pagina = $pagina.Replace('Los datos son una copia tomada de Odoo; se actualizan cuando se vuelve a cargar el archivo.', 'Los datos se consultan en Odoo al abrir la página y se renuevan cada 5 minutos mientras está abierta.')
$cola = "</div>`n<script src=`"d3.min.js`"></script>`n<script src=`"dash-shim.js`"></script>`n<script src=`"app.js`"></script>`n</body>`n</html>`n"
New-Item -ItemType Directory -Force "$raiz\public" | Out-Null
((Get-Content "$PSScriptRoot\cabecera.html" -Raw) + $pagina + $cola) | Set-Content "$raiz\public\index.html" -Encoding utf8NoBOM
Copy-Item "$raiz\page\app.js" "$raiz\public\app.js" -Force
Copy-Item "$raiz\node_modules\d3\dist\d3.min.js" "$raiz\public\d3.min.js" -Force
Get-ChildItem "$raiz\public" | Select-Object Name, Length
# Página de indicadores (PDF / Excel): estática, sin librerías.
Copy-Item "$raiz\page\indicadores.html" "$raiz\public\indicadores.html" -Force
Copy-Item "$raiz\page\indicadores.js" "$raiz\public\indicadores.js" -Force
