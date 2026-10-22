# Fôlego para Android

App nativo de corrida, caminhada e bike para você e seus amigos. Grava o GPS **com a tela bloqueada e o celular no bolso**, mostra a rota em **mapa 3D** com relevo e tem desafio do dia, ranking, aplausos e exportação GPX.

Ninguém precisa de conta: cada pessoa instala o APK, escolhe um apelido e digita o código da turma.

## Como o APK é gerado

O GitHub compila o app de graça na nuvem toda vez que o código muda. Cada compilação vira uma versão na página **Releases** do repositório, com o arquivo `Folego.apk` pronto para baixar.

### Configuração (uma vez só)

1. Crie um repositório **público** no GitHub (ex.: `folego-app`) e envie esta pasta. Ele precisa ser público para seus amigos conseguirem baixar o APK sem login.
2. No repositório, abra **Settings → Secrets and variables → Actions → New repository secret**:
   - Nome: `KEYSTORE_PASSWORD`
   - Valor: a senha da chave que o Claude te passou na conversa
   
   A chave de assinatura (`android/app/folego-release.keystore`) já está no projeto, mas só funciona com essa senha. Ela garante que as próximas versões instalem por cima da anterior sem perder os treinos. **Não perca a senha.**
3. Abra **Actions → Gerar APK do Fôlego → Run workflow**. Leva uns 6 minutos.
4. Em **Releases**, copie o link do `Folego.apk`. O link fixo da versão mais nova é:
   `https://github.com/Gugacaeta-caeta/folego-app/releases/latest/download/Folego.apk`
5. Cole esse link em `www/config.js`, no campo `downloadUrl`, para o botão "Convidar" do app mandar o link certo.

## Instalar no celular

1. Abra o link do `Folego.apk` no celular Android.
2. O Android pede para permitir a instalação de "fontes desconhecidas" para o navegador ou para o WhatsApp. Permita.
3. Na primeira gravação, aceite **Localização: permitir durante o uso** e **Notificações**. A notificação fixa "Fôlego está gravando seu treino" é o que mantém o GPS ligado com a tela apagada.

### Importante em Xiaomi, Samsung, Motorola e outros

Esses celulares economizam bateria fechando apps em segundo plano. Para o treino não cortar:
- **Configurações → Apps → Fôlego → Bateria → Sem restrições** (ou "Não otimizar").
- Na Xiaomi, também ative **Início automático** para o Fôlego.

## Ligar a turma (opcional)

Sem isso o app funciona sozinho, guardando os treinos no celular. Para feed, aplausos e ranking com os amigos:

1. Crie um projeto grátis em supabase.com (região São Paulo).
2. **SQL Editor**: cole o conteúdo de `supabase.sql` e clique em **Run**.
3. **Authentication → Sign In / Providers**: ligue **Allow anonymous sign-ins**.
4. **Project Settings → API**: copie a **Project URL** e a chave **anon public** para `www/config.js`.
5. Envie a alteração ao GitHub. Uma nova versão do APK é gerada; instale por cima.

## Atualizar o app

Qualquer alteração enviada ao repositório gera uma versão nova em Releases. Os amigos baixam pelo mesmo link e instalam por cima, sem perder os treinos.

## Estrutura

| Pasta/arquivo | Para quê |
|---|---|
| `www/` | O app (HTML, CSS e JavaScript), igual à versão web |
| `www/config.js` | Supabase e link de download |
| `android/` | Projeto Android gerado pelo Capacitor 8 |
| `.github/workflows/apk.yml` | Compilação automática do APK |
| `supabase.sql` | Banco e regras de segurança da turma |

Peças usadas, todas gratuitas: Capacitor 8.5, plugin de GPS em segundo plano `@capacitor-community/background-geolocation`, MapLibre GL JS 6.11 (mapa 3D), OpenFreeMap (mapa), AWS Terrain Tiles (relevo), Supabase (turma).
