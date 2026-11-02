# Fôlego para Android

App nativo de corrida, caminhada e bike para você e seus amigos. Grava o GPS **com a tela bloqueada e o celular no bolso**, mostra a rota em **mapa 3D** com relevo e tem desafio do dia, ranking, aplausos e exportação GPX.

Ninguém precisa de conta: cada pessoa instala o APK, escolhe um apelido e digita o código da turma.

## Como o APK é gerado

O GitHub compila o app de graça na nuvem toda vez que o código muda. Cada compilação vira uma versão na página **Releases** do repositório, com o arquivo `Folego.apk` pronto para baixar.

### Configuração (uma vez só)

1. Crie um repositório **público** no GitHub (ex.: `folego-app`) e envie esta pasta. Ele precisa ser público para seus amigos conseguirem baixar o APK sem login.
2. A assinatura do app já vem configurada no projeto (`android/app/folego-release.keystore`). Ela garante que as próximas versões instalem por cima da anterior sem perder os treinos.
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

## Treinador por voz, frequência cardíaca e diagnóstico

- **Voz do treinador:** liga e desliga no botão de alto-falante da tela de gravação. Em Ajustes (toque no seu nome) você escolhe estilo (Animado, Tranquilo, Técnico ou Sargento), voz, velocidade, tom, intervalo dos avisos (500 m a 5 km) e o que ele fala.
- **Frequência cardíaca:** o celular sozinho não mede batimentos. Conecte uma cinta Bluetooth (Polar, Garmin, Coospo, Magene, Wahoo) ou um relógio que transmita a frequência (Amazfit e Mi Band com "Transmitir frequência cardíaca", Garmin com "Transmitir FC", Coros, Suunto) pelo botão de coração na gravação.
- **Calorias:** com sensor e idade preenchida, o cálculo usa a frequência cardíaca. Sem sensor, usa peso, distância e velocidade.
- **Diagnóstico:** ao salvar o treino, toque em **Ouvir diagnóstico**. Ele compara com seus treinos anteriores, analisa as parciais, o terreno, as zonas cardíacas e sugere a recuperação.

## Compartilhar com foto

Ao salvar um treino, o app oferece montar uma imagem para postar: tire uma foto do lugar, uma selfie, escolha da galeria, use o mapa 3D ou só o fundo de pista. São três modelos (Clássico, Número de peito, Mínimo) em formato Story 9:16 ou Post 4:5, com distância, tempo, ritmo, frequência ou calorias e a rota. O botão **Compartilhar imagem** abre o WhatsApp, Instagram, Facebook e outros apps do celular. Também dá para fazer depois, pelo botão **Compartilhar com foto** em qualquer treino.

Se você já tinha ligado a turma no Supabase, rode o `supabase.sql` de novo para criar as colunas de frequência e calorias.

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
