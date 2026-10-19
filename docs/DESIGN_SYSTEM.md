# Koda · design system

A linguagem das referências foi reorganizada para reduzir o ruído visual sem perder a hierarquia operacional: temperatura, estado da carga e próxima ação. Aplicada a login, erro, permissões, pareamento, viagens, detalhes, monitor, alertas, contingência, encerramento, resumo e perfil.

## Fundamentos

- **Tipografia:** Inter 400, 500, 600 e 700. Títulos entre 20–31 px, corpo 13–14 px, informações auxiliares 10–12 px. Temperatura com 60 px e unidade menor.
- **Cores:** azul petróleo `#147D92` para ações, marinho `#172F3B` para destaque, fundo `#F5F7F8`, superfície branca e borda `#E6EBEE`. Verde `#168361`, vermelho `#CE493E` e âmbar `#A96A12` comunicam os estados com texto e ícones, além da cor.
- **Espaço:** base de 4 px; margens laterais de 22–24 px, intervalos de 8–24 px. Cartões com 18 px de preenchimento, bordas sutis, cantos de 20 px e sem sombras pesadas.
- **Controles:** botão principal com altura mínima de 52 px e canto de 14 px. Ícones Lucide com traço de 1,6–2 px. Barra inferior fixa e conteúdo rolável dentro das safe areas.
- **Responsividade:** base móvel de 390 × 844, layout fluido até 520 px; rolagem para telas de 320 px e textos maiores. Sem alturas fixas para blocos de conteúdo.
- **Tema escuro:** superfícies azul-marinho e texto claro. Todas as telas consultam a mesma paleta; a preferência vale durante a sessão do app.

## Componentes

`src/shared/theme.tsx` define tokens e paletas. `src/shared/ui.tsx` oferece botões, aviso de erro, carregamento e rodapé. `src/shared/components/primitives.tsx` reúne Screen, Header, Card, Label, Eyebrow, Badge, Sheet, EmptyState e Info. `AppChrome` contém as abas, conectividade e identificação da demonstração.

Gráficos e medidor são SVG e recebem leituras reais do domínio. Não são imagens de fundo. O mapa demonstrativo é identificado como ilustração; o modo real usa coordenadas fornecidas pela operação. O mapa web encaminha para navegação externa.

## Comportamento

- Uma ação principal por etapa: entrar → permitir → parear → escolher/iniciar viagem → monitorar → confirmar entrega.
- Erros de credenciais aparecem junto ao campo e em aviso dispensável. Carregamentos impedem envio duplicado.
- Offline não impede o acompanhamento de uma viagem já ativa; impede o aceite e a confirmação de entrega sem sincronização.
- Um sensor ausente ou uma leitura antiga nunca aparece como monitoramento ao vivo saudável.
- Alerta crítico interrompe o fluxo com contexto e ações de contingência/contato. Dispensar o modal não resolve o alerta.
- Modais fechados saem da árvore acessível. Botões, campos e abas possuem nomes e estados acessíveis.
- Controles e dados de demonstração são identificados e não ficam habilitados em bundles de produção.
