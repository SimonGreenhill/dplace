import re
from collections import defaultdict

from nexus import NexusReader
from ete3 import Tree
from ete3.coretype.tree import TreeError
from dplace_app.models import (
    Society, LanguageTree, Language, LanguageTreeLabels, LanguageTreeLabelsSequence,
)
from dplace_app.tree import update_newick


def tree_names(repos):
    sequences = []
    for phylo in repos.phylogenies:
        _tree_names(phylo, sequences)
    LanguageTreeLabelsSequence.objects.bulk_create(sequences)
    return len(sequences)
            

def _tree_names(phylo, label_sequences):
    try:
        tree = LanguageTree.objects.get(name=phylo.id)
    except:
        return False

    try:
        Tree(tree.newick_string, format=1)
    except TreeError:
        return False

    for item in phylo.xdid_socid_links:
        name_on_tip = item['Name_on_tree_tip']
        xd_ids = [i.strip() for i in item['xd_id'].split(',')]
        society_ids = [i.strip() for i in item['soc_id'].split(',')]

        if not xd_ids:  # pragma: no cover
            continue

        label, created = LanguageTreeLabels.objects.get_or_create(
            languageTree=tree, label=name_on_tip)
        
        tree.taxa.add(label)
        for society in Society.objects.all().filter(xd_id__in=xd_ids):
            try:
                f_order = len(society_ids) - society_ids.index(society.ext_id) - 1
            except:
                f_order = 0
            label_sequences.append(
                LanguageTreeLabelsSequence(
                    society=society, labels=label, fixed_order=f_order))
    tree.save()
    return True


def load_trees(repos, verbose=False):
    l_by_iso, l_by_glotto, l_by_name = \
        defaultdict(list), defaultdict(list), defaultdict(list)

    for lang in Language.objects.all():
        if lang.iso_code:
            l_by_iso[lang.iso_code].append(lang)
        l_by_glotto[lang.glotto_code].append(lang)
        l_by_name[lang.name].append(lang)

    def get_language(taxon_name):
        if taxon_name in l_by_iso:
            return l_by_iso[taxon_name]
        if taxon_name in l_by_glotto:
            return l_by_glotto[taxon_name]
        if taxon_name in l_by_name:
            return l_by_name[taxon_name]

    sources = {}
    return sum(_load_tree(obj, get_language, sources)
               for obj in repos.phylogenies + repos.trees)


def _load_tree(obj, get_language, sources):
    # now add languages to the tree
    reader = NexusReader(obj.trees.as_posix())

    # make a tree if not exists. Use the name of the tree
    tree, created = LanguageTree.objects.get_or_create(name=obj.id)
    if not created:
        return 0

    source = sources.get((obj.author, obj.year))
    if not source:
        sources[(obj.author, obj.year)] = source = obj.as_source()
        source.save()
    tree.source = source

    # Remove '[&R]' from newick string
    reader.trees.detranslate()
    newick = re.sub(r'\[.*?\]', '', reader.trees.trees[0])
    try:
        newick = newick[newick.index('=') + 1:]
    except ValueError:  # pragma: no cover
        newick = newick

    tree.newick_string = str(newick)
    if obj.__class__.__name__ == 'Tree':
        for taxon_name in reader.trees.taxa:
            languages = get_language(taxon_name)
            if not languages:
                continue

            for l in languages:
                society = Society.objects.filter(language=l)
                label = LanguageTreeLabels.objects.create(
                    languageTree=tree, label=taxon_name, language=l)
                for s in society:
                    LanguageTreeLabelsSequence.objects.create(
                        society=s, labels=label, fixed_order=0)
                tree.taxa.add(label)
    tree.save()
    return 1


def prune_trees(_):
    labels = LanguageTreeLabels.objects.all()
    count = 0
    for t in LanguageTree.objects.order_by('name').all():
        if update_newick(t, labels):
            count += 1
            t.save()
    return count
