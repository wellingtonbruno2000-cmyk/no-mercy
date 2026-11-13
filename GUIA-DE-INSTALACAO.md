# NO MERCY — Guia completo de instalação

Este guia tem 6 partes:

1. Jogar no seu computador (teste local)
2. Colocar o código no GitHub
3. Publicar na internet de graça (Render)
4. Instalar o jogo como aplicativo (PC e celular)
5. Fazer o jogo aparecer no Google
6. Instalador .exe para Windows (programa de PC)

> Quer só jogar no PC agora? Pule direto para a **Parte 6** e use o instalador `NO-MERCY-Setup-1.2.2.exe`.

---

## PARTE 1 — Jogar no seu computador

### 1.1 Instalar o Node.js (só uma vez)
1. Acesse **https://nodejs.org/pt-br/download**
2. Clique no botão verde **"Instalador Windows (.msi)"**
3. Abra o arquivo baixado e clique **Next** em tudo até **Install** → **Finish**
4. Para conferir: tecla Windows → digite `cmd` → Enter → digite `node -v` → Enter
   Deve aparecer algo como `v26.13.1`.

### 1.2 Descompactar o jogo
1. Baixe o arquivo **no-mercy.zip**
2. Clique com o botão direito → **Extrair tudo** → escolha a **Área de Trabalho**
3. Vai aparecer a pasta **no-mercy**

### 1.3 Abrir o terminal dentro da pasta
1. Abra a pasta **no-mercy** (você deve ver arquivos como `package.json`, `README.md`)
2. Clique na **barra de endereço** do Windows Explorer (lá em cima), apague o que estiver escrito, digite `cmd` e aperte **Enter**
3. Abre uma janela preta já dentro da pasta do jogo

### 1.4 Instalar e iniciar (digite um comando por vez, apertando Enter)
```
npm install
```
(espere terminar, 1 a 3 minutos — avisos amarelos são normais)
```
npm run build
```
(deve aparecer `✓ built in ...`)
```
npm start
```
Quando aparecer **"NO MERCY rodando em http://localhost:3001"**, abra o navegador em:

**http://localhost:3001**

> Deixe a janela preta aberta enquanto joga. Para desligar o jogo, feche a janela.
> Nas próximas vezes, basta repetir o passo 1.3 e o comando `npm start`.

---

## PARTE 2 — Colocar o código no GitHub

O GitHub guarda o código na internet. O Render (Parte 3) publica o jogo a partir dele.

### 2.1 Criar a conta
1. Acesse **https://github.com** → **Sign up**
2. Preencha e-mail, senha e nome de usuário e confirme o e-mail

### 2.2 Criar o repositório
1. Já logado, clique no **+** (canto superior direito) → **New repository**
2. **Repository name:** `no-mercy`
3. Marque **Public** (ou Private, os dois funcionam no Render)
4. **Não** marque "Add a README"
5. Clique **Create repository**

### 2.3 Enviar os arquivos
1. Na página do repositório recém-criado, clique no link **"uploading an existing file"**
2. Abra a pasta **no-mercy** no seu computador, selecione **TUDO que está dentro dela** (Ctrl+A)
   - ⚠️ Se você já rodou o jogo localmente, **NÃO** envie as pastas `node_modules` e `dist`
     (desmarque-as segurando Ctrl e clicando nelas). Elas são enormes e são recriadas automaticamente.
3. Arraste os arquivos e pastas selecionados para a página do GitHub
4. Espere carregar e clique no botão verde **Commit changes**

> Alternativa: me diga o nome do seu repositório (ex.: `seuusuario/no-mercy`) e eu envio daqui.

---

## PARTE 3 — Publicar na internet de graça (Render)

### 3.1 Criar a conta
1. Acesse **https://render.com** → **Get Started**
2. Escolha **GitHub** para entrar (e autorize o Render a ver seus repositórios)

### 3.2 Publicar
1. No painel, clique **New +** → **Blueprint**
2. Escolha o repositório **no-mercy** → **Connect**
3. O Render lê o arquivo `render.yaml` e mostra o serviço **no-mercy** (plano Free)
4. Se pedir o valor de **SITE_URL**, deixe em branco por enquanto
5. Clique **Apply** / **Deploy Blueprint**
6. Espere de 3 a 8 minutos até aparecer **Live** (verde)

> Se preferir sem Blueprint: **New +** → **Web Service** → escolha o repositório →
> **Language: Docker** → **Instance Type: Free** → **Create Web Service**.

### 3.3 Configurar o endereço
1. Abra o serviço **no-mercy** no Render. No topo aparece o endereço, por exemplo
   `https://no-mercy-abcd.onrender.com` — **copie**
2. Menu da esquerda → **Environment** → **Add Environment Variable**
   - **Key:** `SITE_URL`
   - **Value:** o endereço copiado (sem barra no final)
3. **Save Changes** (o Render publica de novo sozinho, espere ficar **Live**)

🎉 **Pronto! Mande esse endereço para seus amigos.** Funciona no PC e no celular, com chat de voz.

> **Plano grátis:** depois de ~15 minutos sem ninguém jogando o servidor "dorme".
> O próximo acesso demora cerca de 1 minuto para abrir. Se o servidor reiniciar, salas em andamento são perdidas.

### 3.4 Atualizar o jogo no futuro
Quando eu te mandar uma versão nova: no GitHub, abra o repositório → **Add file** → **Upload files**,
arraste os arquivos novos (substituindo os antigos) → **Commit changes**. O Render publica sozinho em alguns minutos.

---

## PARTE 4 — Instalar como aplicativo

(Funciona com o jogo publicado no Render — precisa de HTTPS.)

### No PC (Chrome ou Edge)
1. Abra o endereço do seu jogo
2. Clique em **"Instalar app"** na tela inicial do jogo
   — ou no ícone de **instalar** (um monitor com seta) no canto direito da barra de endereço
3. Confirme **Instalar**
4. Pronto: ícone do NO MERCY na área de trabalho e no menu Iniciar, abrindo em janela própria

### No Android (Chrome)
1. Abra o endereço do jogo
2. Toque em **"Instalar app"** (ou menu **⋮** → **Instalar app** / **Adicionar à tela inicial**)

### No iPhone / iPad (Safari)
1. Abra o endereço do jogo no **Safari**
2. Toque no botão **Compartilhar** (quadrado com seta para cima)
3. Toque em **Adicionar à Tela de Início** → **Adicionar**

O app se atualiza sozinho sempre que você publicar uma nova versão.

---

## PARTE 5 — Aparecer no Google

1. Acesse **https://search.google.com/search-console** e entre com sua conta Google
2. Clique **Adicionar propriedade** → escolha **Prefixo do URL**
3. Cole o endereço do jogo (ex.: `https://no-mercy-abcd.onrender.com`) → **Continuar**
4. Na verificação, escolha **Tag HTML**: o Google mostra algo como
   `<meta name="google-site-verification" content="ABC123..." />`
   - Copie **somente o código** dentro de `content="..."` (ex.: `ABC123...`)
   - No Render → **Environment** → adicione a variável **GOOGLE_SITE_VERIFICATION** com esse código → **Save**
   - Espere ficar **Live** e clique **Verificar** no Google
5. No menu do Search Console: **Sitemaps** → digite `sitemap.xml` → **Enviar**
6. No topo, em **Inspecionar URL**, cole o endereço do jogo → **Solicitar indexação**

⏳ Leva de alguns dias a algumas semanas para aparecer nas buscas. Pesquise por **"NO MERCY jogo de cartas"**.

> Opcional (pago, ~R$ 40/ano): um domínio próprio como `nomercy.com.br` ajuda nas buscas.
> No Render: **Settings** → **Custom Domains**. Depois atualize a variável `SITE_URL`.

---

## PARTE 6 — Instalador .exe para Windows

O instalador cria o programa **NO MERCY** no seu PC, com ícone na área de trabalho e no menu Iniciar.
- **Jogar offline:** contra bots, sem internet (o servidor do jogo roda dentro do programa).
- **Jogar online:** com amigos, usando o endereço do jogo publicado no Render (Parte 3).

### 6.1 Instalar
1. Baixe o arquivo **NO-MERCY-Setup-1.2.2.exe** e dê dois cliques nele
2. O Windows pode mostrar **"O Windows protegeu o computador"** (acontece com todo programa sem
   assinatura digital paga). Clique em **Mais informações** → **Executar assim mesmo**
3. Siga o instalador: **Avançar** → escolha a pasta (pode deixar a sugerida) → **Instalar** → **Concluir**
   - Não precisa de senha de administrador
4. Abra pelo atalho **NO MERCY** na área de trabalho

### 6.2 Usar
- Tela inicial do programa:
  - **Jogar offline** → partida contra bots imediatamente
  - **Jogar online** → na primeira vez, cole o endereço do seu jogo do Render
    (ex.: `https://no-mercy-abcd.onrender.com`), clique **Salvar** e depois **Jogar online**
- **F11** = tela cheia · **Ctrl+M** = voltar à tela inicial · **Alt** = mostrar o menu
- Se o Windows perguntar sobre o **microfone** no modo online, permita (chat de voz)

### 6.3 Desinstalar
Menu Iniciar → pasta **NO MERCY** → **Desinstalar NO MERCY**
(ou Configurações → Aplicativos → NO MERCY → Desinstalar).

### 6.4 Gerar um instalador novo (opcional)
Depois de publicar no GitHub (Parte 2), dá para gerar o .exe num Windows do próprio GitHub, de graça:
1. No repositório, aba **Actions** → **Instalador para Windows** → **Run workflow**
2. (Opcional) cole o endereço do jogo online — assim o programa já vem configurado para os amigos
3. Espere ~10 minutos → abra a execução concluída → baixe **NO-MERCY-instalador-windows** (zip com o .exe)

> Se a aba Actions pedir para ativar, clique em **I understand my workflows, go ahead and enable them**.

Também dá para gerar no seu PC (com Node.js instalado), dentro da pasta `desktop`:
```
npm install
npm run dist:win
```
O instalador aparece em `desktop\release\`.

### 6.5 Distribuir para outras pessoas (opcional, grátis)
Crie uma conta em **https://itch.io** → **Upload new project** → *Kind of project: Downloadable* →
envie o `.exe` e marque **Windows**. O itch.io cria uma página pesquisável para o jogo.

---

## Mesa 3D — controles

Nas partidas de **2 a 4 jogadores** a mesa é 3D (até três personagens).
- **Multiplayer:** a cabeça do boneco de cada amigo segue o mouse dele em tempo real.
- **Mouse:** mexa o mouse para olhar ao redor da mesa. Os personagens acompanham você com o olhar.
- **Suas cartas em 3D:** clique numa carta das suas mãos para selecionar e depois em **Jogar carta**.
  Quando você passa o mouse sobre suas cartas, os adversários ficam desconfiados.
- **Celular/tablet:** arraste **um dedo** na mesa para olhar ao redor — a visão fica onde você soltar. **Toque duas vezes** na mesa para centralizar. (As cartas ficam em 2D, mais fáceis de ler.)
- Botões na barra de cima: **2D/3D** (troca a mesa) e **Mão 2D/Mão 3D** (no computador).
- Se o aparelho estiver lento, o jogo reduz a qualidade sozinho (resolução e sombras). Se ainda travar, use **2D**.

---

## Problemas comuns

| Problema | Solução |
|---|---|
| `'node' não é reconhecido` | Feche e abra o terminal de novo. Se continuar, reinicie o PC. |
| `EADDRINUSE: port 3001` | O jogo já está aberto em outra janela. Feche-a. |
| Página em branco no local | Rode `npm run build` e depois `npm start` de novo. |
| Render deu erro no deploy | Confira se enviou `package.json`, `package-lock.json`, `Dockerfile` e as pastas `client`, `server`, `shared`. |
| Site do Render demora a abrir | Normal no plano grátis após inatividade (~1 min). |
| Chat de voz não conecta | Use o endereço `https://` do Render e permita o microfone no navegador. |
| Botão "Instalar app" não aparece | Use Chrome/Edge com o endereço `https://`. Se já instalou, ele some. |
| Mesa 3D lenta no celular | Toque no botão **2D** na barra de cima. |
| "O Windows protegeu o computador" | Normal (programa sem assinatura paga): **Mais informações** → **Executar assim mesmo**. |
| Antivírus bloqueou o instalador | Falso positivo comum em programas novos sem assinatura; libere o arquivo no antivírus. |
| Programa: "Não foi possível conectar ao servidor online" | Confira o endereço salvo e a internet; se o Render estava dormindo, aguarde 1 min e tente de novo. |
