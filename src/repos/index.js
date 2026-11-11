"use strict";

/**
 * Ponto unico de acesso aos dados.
 *
 * Em operacao normal devolve os repositorios de Postgres, que e' a persistencia
 * oficial (§9, §74). O modo demonstracao em memoria e' apenas um apoio
 * temporario de desenvolvimento e nao faz parte da versao alvo (§61).
 */

const demo = require("../demo/config");

const postgres = {
  users: require("./users"),
  artists: require("./artists"),
  releases: require("./releases"),
  listens: require("./listens"),
  ratings: require("./ratings"),
  reviews: require("./reviews"),
  lists: require("./lists"),
};

if (demo.ativo) {
  const memoria = require("../demo/store");
  module.exports = {
    users: memoria.users,
    artists: memoria.artists,
    releases: memoria.releases,
    listens: memoria.listens,
    ratings: memoria.ratings,
    reviews: memoria.reviews,
    lists: memoria.lists,
  };
} else {
  module.exports = postgres;
}
