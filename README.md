# Digita

Gerador de vídeos de **balões de chat com efeito de digitação**, para criadores de conteúdo que querem «falar» com o público através de mensagens de texto. Escreves um roteiro, as mensagens aparecem no canto inferior esquerdo com indicador «a escrever…», texto letra a letra e sons de teclado, sobre fundo verde (chroma key). No fim, gravas e descarregas o vídeo — ou captas o palco com OBS / CapCut / gravador de ecrã.

**Tudo corre no navegador.** Não há backend, upload nem analytics: roteiros e preferências ficam em `localStorage`; vídeo, avatar e sons próprios existem só em memória.

## Funcionalidades

- **Palco em `<canvas>`** (nítido em ecrãs HiDPI) com balões estilo iMessage (claro/escuro), WhatsApp, Minimal e Personalizado; cauda no último balão do grupo; entrada com escala + fade + bounce; máximo de balões visíveis configurável; os balões **desaparecem sozinhos X segundos depois de enviados** (3 s por defeito, 0 = ficam); quebra de linha automática; emojis.
- **Avatar** opcional (imagem local recortada em círculo, alinhado ao último balão) e nome acima do primeiro balão.
- **Escrever ao vivo** (botão ou `L`): escreves com o teclado diretamente no palco; `Enter` envia, `Shift+Enter` muda de linha, `>` no início faz uma resposta à direita, `Backspace` corrige. Cada tecla toca o som no mesmo instante em que a letra aparece, e também se pode **gravar** assim (`Esc` termina e abre a pré-visualização).
- **Sons sintetizados** com Web Audio (sem ficheiros), modelando um teclado mecânico real: clique do interruptor, pancada na placa com ressonâncias do corpo, **som de soltar a tecla**, estabilizadores no espaço/Enter, variação por tecla, posição estéreo e um pouco de «sala». Presets: clicky, thocky, membrana, máquina de escrever (com «ding»), toque de telemóvel; volume, ambiente, variação de tom e de ritmo, som próprio para espaço/Enter, som de «enviado», botão «testar» em cada preset e upload de um som próprio (.mp3/.wav). Os toques são agendados com precisão de amostra (não ao fotograma), e há um ajuste de **sincronização (±150 ms)** para compensar atrasos de colunas/Bluetooth ou do vídeo gravado.
- **Roteiro** com sintaxe simples, estimativa de duração, guardar/carregar (localStorage) e exportar/importar `.json`.
- **Fundo**: verde `#00B140`, azul `#0047BB`, preto, cor própria ou transparente (WebM, avançado).
- **Dois modos**: *Apresentação* (modo limpo, sem gravar) e *Gravar no site* (16:9, 9:16, 1:1; 30/60 fps; MP4 se o navegador suportar, senão WebM; com ou sem som).
- Interface em português, pronta para mais idiomas (`js/i18n.js` já traz inglês); PWA que funciona offline depois de carregada.

## Correr localmente

Não há passo de build — são ficheiros estáticos com módulos ES.

```bash
npm start            # servidor sem dependências em http://localhost:8080
# ou qualquer servidor estático:
python3 -m http.server 8080
```

> Abre por `http://localhost` (ou HTTPS). Os módulos ES e o service worker não funcionam em `file://`.

Testes da lógica (parser, linha do tempo, traduções) — Node 18+:

```bash
npm test
```

## Como usar

1. **Roteiro**: uma linha = uma mensagem.

   | Sintaxe | Efeito |
   | --- | --- |
   | linha vazia | pausa extra (configurável) |
   | `[pausa 2s]` | pausa de 2 s (`1.5s`, `500ms` também) |
   | `[rapido]` / `[lento]` | velocidade da **próxima** mensagem (`[normal]` repõe) |
   | `> texto` | mensagem do lado direito (balão azul, «resposta») |
   | `\> texto` | começa com um `>` literal |
   | `\n` dentro do texto | quebra de linha no mesmo balão |

2. **Reproduzir** e afinar aparência, sons e tempos no painel *Configurações*.
3. **Capturar**:
   - *Modo limpo* (botão ou `F`): só o palco, em ecrã inteiro, para OBS/CapCut/gravador do sistema. A contagem 3-2-1 e o cursor escondido são opcionais. Ao mexer o rato (ou tocar) aparece uma barra discreta para reproduzir/reiniciar/sair.
   - *Gravar* (botão ou `R`): contagem 3-2-1 → reproduz o roteiro → pára sozinho → pré-visualização local → **Descarregar** ou **Descartar**. Ficheiro: `digita-AAAA-MM-DD-HHMM.mp4/.webm`.
4. No editor de vídeo, aplica **chroma key** ao verde.

### Atalhos

| Tecla | Ação |
| --- | --- |
| `Espaço` | reproduzir / pausar / retomar |
| `R` | gravar (durante a gravação: terminar). **No modo limpo: reiniciar** |
| `Enter` | reiniciar (modo limpo) |
| `F` | modo limpo |
| `L` | escrever ao vivo |
| `Esc` | fechar janela · sair do modo limpo / ao vivo · cancelar gravação (numa gravação ao vivo: terminar) |

## Privacidade

Nenhum vídeo, imagem, áudio ou roteiro sai do dispositivo. O vídeo gravado é um `Blob` em memória; ao descarregar ou descartar, o URL é revogado (`URL.revokeObjectURL`) e não fica cópia. A política de segurança (CSP) incluída nos ficheiros de deploy bloqueia ligações a outros domínios (`connect-src 'self'`).

## Deploy (site estático)

| Plataforma | Como |
| --- | --- |
| **Vercel** | Importa o repositório; *Framework: Other*, sem build nem output directory. `vercel.json` já define os cabeçalhos. |
| **Netlify** | *Publish directory*: `.` e sem comando de build. `_headers` define os cabeçalhos. |
| **GitHub Pages / outro** | Publica a raiz do repositório (o app usa só caminhos relativos). |
| **Docker / Nginx** | `docker build -t digita .` e `docker run -p 8080:80 digita` |
| **Dokploy** | Application → Provider *GitHub* → Build Type *Dockerfile* (`./Dockerfile`, contexto `.`); em *Domains* define o domínio com **HTTPS** e porta do contentor **80**. |

## Estrutura

```
index.html            página única
css/style.css         interface
js/main.js            orquestração (modos, atalhos, gravação, modais)
js/script-parser.js   roteiro → itens
js/timeline.js        itens + tempos → linha do tempo determinística
js/renderer.js        desenho do palco em canvas, em função do tempo t
js/audio.js           sons sintetizados (Web Audio) + saída para gravação
js/recorder.js        MediaRecorder, escolha de formato, nome do ficheiro
js/player.js          relógio de reprodução e disparo de sons
js/live.js            sessão «escrever ao vivo»
js/settings.js        preferências e roteiros (localStorage com try/catch)
js/ui.js              painel de configurações, avisos, downloads
js/i18n.js            traduções (pt, en)
sw.js, manifest.*     PWA / offline
tests/                testes Node (node:test)
```

Como a cena é uma função pura de `t`, o ecrã e a gravação mostram exatamente o mesmo, e pausar/reiniciar são triviais.

## Navegadores e limitações

Verificado automaticamente em **Chromium 141** (o mesmo motor do Chrome e do Edge): reprodução, modo limpo, gravação 1920×1080 com áudio (o ficheiro resultante foi analisado com `ffprobe`), descarregar/descartar e libertação da memória, e interface em ecrã de telemóvel. **Firefox não foi testado** neste ambiente; o que se segue para ele vem da documentação de compatibilidade, não de testes.

| | Chrome / Edge (Chromium) | Firefox | Safari |
| --- | --- | --- | --- |
| Reproduzir, sons, modo limpo | ✅ | esperado ✅ | esperado ✅ |
| Gravar | ✅ | esperado ✅ (WebM) | depende da versão |
| MP4 (H.264) | ✅ nas versões recentes (a app mostra o formato antes de gravar) | ❌ — usa WebM | ✅ |
| WebM VP9 com transparência | ✅ no Chromium testado (canal alfa confirmado); confirma no teu editor | ❌ — avisa e usa o verde | ❌ |

Outras notas:

- Os sons são sintetizados e verificados por análise (níveis sem clipping, espectro de cada preset), mas a **qualidade percebida é subjetiva**: afina volume, ambiente e sincronização no painel, ou carrega uma gravação tua do teu teclado como som próprio.
- **Mantém o separador visível durante a gravação.** Em segundo plano o navegador pára de desenhar e o vídeo pode perder imagens; a app avisa se isso acontecer.
- A **duração** de ficheiros WebM gravados no Chrome pode não vir nos metadados; alguns leitores/editores mostram-na em falta (reexportar com o editor resolve).
- **Áudio e formato:** por defeito grava-se em **WebM (VP9 + Opus)**, o caminho verificado de ponta a ponta; MP4 é opcional («Formato do ficheiro») e, com som, só é usado se o navegador gravar áudio AAC; caso contrário a app usa **WebM (VP9 + Opus)**, porque Opus dentro de MP4 fica mudo em vários leitores (Windows Filmes e TV, QuickTime). Se mesmo assim aparecer Opus em MP4, a pré-visualização avisa. A pré-visualização também avisa quando o nível medido durante a gravação indica silêncio e, depois de gravar, **descodifica o áudio do próprio ficheiro** e avisa se ele estiver mudo. Um `.webm` abre bem no VLC, Chrome, CapCut, DaVinci Resolve e Premiere recentes; para o Windows Filmes e TV ou o QuickTime converte-o (ex.: `ffmpeg -i in.webm -c:v libx264 -c:a aac out.mp4`).
- Os sons próprios, o avatar e o vídeo **não são guardados**: ao recarregar a página têm de ser carregados de novo.
- Fontes: usa as do sistema (para funcionar offline e sem pedidos externos); o aspeto varia ligeiramente entre sistemas operativos, tal como os emojis.
- Pré-visualizar áudio exige um clique/tecla antes (regra dos navegadores para Web Audio).
