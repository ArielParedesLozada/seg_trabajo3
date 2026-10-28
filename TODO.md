# TRABAJO 3

Crear una miniaplicacion con un Framework (tipo React o asi) que muestre los errores que salen de la base de datos crudamente

## ESCENARIO

Una empresa de comercio electronico necesita desarrollar un sistema seguro para registrar productos vendidos desde una API

## RESTRICCIONES DEL SISTEMA

Hay que evitar
- Nombres vacios
- Precios negativos
- Stock invalido
- Categorias incorrectas (perecible, no perecible)
- Payloads enormes
- Codigos duplicados
- Fechas invalidas
- Caracteres no permitidos
- Datos corruptos

## QUID DE LA CUESTION

Las validaciones y restricciones se hacen A NIVEL DE BASE DE DATOS. Es decir, TODAS LAS RESTRICCIONES SE MUESTRAN EN EL ESQUEMA DE LA BASE

## IDEA DE IMPLEMENTACION

- Definir el esquema de la base de datos en un archivo SQL, ubicado en ./sql/
- Generar una miniapp con React, que se conecte a la base de datos
- Mostrar los errores CRUDOS que lanza la base de datos
